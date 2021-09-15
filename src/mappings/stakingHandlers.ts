import { SubstrateEvent } from "@subql/types";
import { sha256 } from 'js-sha256';
import { Era } from "../types/models/Era";
import { NominatorValidator } from '../types/models/NominatorValidator';
import { getOrCreateAccount } from "./identityHandlers"
import { EraIndex, Exposure, BalanceOf,EventRecord,AccountId } from "@polkadot/types/interfaces";
import {EraValidator, Session, ValidatorPayout} from "../types";
import {SessionIndex} from "@polkadot/types/interfaces/session";
import { Vec } from '@polkadot/types';
import { AnyTuple, CallBase } from '@polkadot/types/types';
import { uniq, flatten } from "lodash";

async function ensureSession(sessionId: number, startBlock: number){
    let session = new Session(sessionId.toString());
    session.startBlock = startBlock;
    await session.save()
    let previousSession = await Session.get((sessionId-1).toString());
    if(previousSession){
        previousSession.endBlock = startBlock -1 ;
        await previousSession.save();
    }
}

export async function handleSession(event: SubstrateEvent): Promise<void> {
    let {event: {data: [sessionIndex]}} = event;
    let currentBlockNumber = event.block.block.header.number.toNumber()

    await ensureSession((sessionIndex as SessionIndex).toNumber(), currentBlockNumber);
    if (!api.query.staking.activeEra) return;
    const currentEraOptional = await api.query.staking.activeEra();
    if (currentEraOptional.isEmpty || currentEraOptional.isNone) {
        return;
    }else{
        const currentEra = currentEraOptional.unwrap()
        const eraSaved = await Era.get(currentEra.toString());
        if (eraSaved) {
            return
        }else{
            await saveCurrentEra(currentEra.index, currentBlockNumber);
            await saveValidators(currentEra.index.toNumber());
        }
    }
}

async function saveCurrentEra(currentEraIndex: EraIndex, blockNumber: number){
    let currentEraNumber = currentEraIndex.toNumber()
    let currentEraString = currentEraIndex.toString()
    const newEra = new Era(currentEraString);
    newEra.startBlock = blockNumber;
    await newEra.save();
    const previousEraIndex = currentEraNumber - 1;
    let previousEra = await Era.get(previousEraIndex.toString());
    if (previousEra) {
        previousEra.endBlock = blockNumber - 1;
        await previousEra.save();
    }
}

async function saveValidators(currentEraNumber: number) {
    let exposures = await api.query.staking.erasStakers.entries(currentEraNumber);

    await Promise.all(exposures.map(async ([key, exposure]) => {
        const [, validatorId] = key.args
        let validatorIdString = validatorId.toString()
        await saveEraValidator(currentEraNumber, exposure, validatorIdString);
        await saveNominatorValidator(currentEraNumber, exposure, validatorIdString);
    }))
}

async function saveNominatorValidator(currentEraNumber: number, exposure: Exposure, validatorId: string) {
    const { others } = exposure;
    const validatorAccount = await getOrCreateAccount(validatorId)

    for (const nominator of others) {
        const nominatorId = nominator.who.toString();
        const nominatorAccount = await getOrCreateAccount(nominatorId);
        const nominatorValidatorId: string = sha256(`${currentEraNumber.toString()}${nominatorAccount.id}${validatorAccount.id}`);
        const eraNominatorValidator = await NominatorValidator.get(nominatorValidatorId);

        if (!eraNominatorValidator) {
            const currNominatorValidator = new NominatorValidator(nominatorValidatorId);
            currNominatorValidator.eraId = currentEraNumber.toString();
            currNominatorValidator.nominatorId = nominatorAccount.id;
            currNominatorValidator.validatorId = validatorAccount.id;
            await currNominatorValidator.save().catch(e => { logger.error(e) })
        }
    }
}

async function saveEraValidator(currentEraNumber: number, exposure: Exposure, validatorId: string) {
    let currenEraString = currentEraNumber.toString()
    let entryId: string = sha256(`${currenEraString}${validatorId}}`)
    let validator = await getOrCreateAccount(validatorId)

    const eraValidator = new EraValidator(entryId);
    eraValidator.eraId = currenEraString
    eraValidator.validatorId = validator.id
    eraValidator.total = exposure.total.toBigInt()
    eraValidator.own = exposure.own.toBigInt()
    eraValidator.others = exposure.others.map(other => {
        return {
            nominator: other.who.toString(),
            value: other.value.toString()
        }
    })

    await eraValidator.save().catch(e => { logger.error(e) })
}

export async function handleEraPayout(event: SubstrateEvent): Promise<void> {
    const {
        event: {
            data: [eraIndex, validatorPayout,],
        },
    } = event;
    const era = await Era.get(eraIndex.toString());
    if(era){
        await syncEraPayout(eraIndex as EraIndex,validatorPayout as BalanceOf)
    }else{
        logger.error(`EraPayout at era ${eraIndex.toString()},but can not find era`)
        process.exit(1)
    }
}
async function syncEraPayout(eraIndex: EraIndex, eraTotalPayout: BalanceOf): Promise<void>{
    const erasRewardPoints = await api.query.staking.erasRewardPoints(eraIndex);
    for(const [accountId, rewardPoint] of erasRewardPoints.individual){
        let payout = new ValidatorPayout(sha256(`${eraIndex.toString()}${accountId.toString()}`))
        //in early eras [0], exposure missed validators and nominator account, but they still get reward
        await getOrCreateAccount(accountId.toString());
        payout.eraId = eraIndex.toNumber();
        payout.isClaimed = false;
        payout.validatorId = accountId.toString();
        // USE BN METHOD?
        const reward = (eraTotalPayout.div(erasRewardPoints.total)).mul(rewardPoint);
        payout.totalPayout = BigInt(reward.toString());
        await payout.save()
    }
}



export async function handleReward(event: SubstrateEvent): Promise<void>{
    let {event: {data: [account, reward]}} = event;
    let blockNumber =  event.block.block.header.number.toString();

    if (!event.extrinsic){
        logger.warn(`Reward event ${blockNumber}-${event.idx} has no extrinsic`)
        await checkPayoutEraEnd(account.toString(),blockNumber);
    } else if(!event.extrinsic.success){
        return
    }
    else{
        const extrinsic = event.extrinsic;
        const call = extrinsic.extrinsic.method;

        if((call.section === 'staking' && call.method === "payoutStakers")){
            const payout = extractPayoutStakerFromCall(call)
            await updateValidatorPayout(
                payout.era,
                payout.account,
                blockNumber,
                extrinsic.extrinsic.signer.toString()
            )
        }
        else if(
            (call.section === 'utility' && call.method === "batch")||
            (call.section === 'utility' && call.method === 'batchAll') ||
            (call.section === 'utility' && call.method === 'asDerivative') ||
            (call.section === 'proxy' && call.method === 'proxy' )
        ){
            const events = extrinsic.events;
            for (const payout of flatten(extractPayoutStakersFromNestedCalls(call,events))){
                await updateValidatorPayout(
                    payout.era,
                    payout.account,
                    extrinsic.block.block.header.number.toString(),
                    extrinsic.extrinsic.signer.toString()
                )
            }
        }
        else if (call.section === 'staking' &&
            call.method === `payoutNominator`){
            const era = call.args[0].toString();
            for(const [account,] of call.args[1] as Vec<(AccountId)>){
                await updateValidatorPayout(
                    era,
                    account.toString(),
                    extrinsic.block.block.header.number.toString(),
                    extrinsic.extrinsic.signer.toString()
                )
            }
        }
        else if ((call.section === 'timestamp' &&
            call.method === `set`) || (call.section === 'staking' &&
            call.method === `payoutValidator`)
        ){
            return
        }
        else{
            logger.warn(`Reward event: unexpect extrinsic ${call.section}.${call.method}`)
            process.exit(1)
        }
    }
}

async function checkPayoutEraEnd(account: String, claimedBlockId:string ): Promise<void>{
    //If claim is triggered from system
    if (!api.query.staking.activeEra) return;
    const currentEraOptional = await api.query.staking.activeEra();
    if (currentEraOptional.isNone || currentEraOptional.isEmpty) return;
    const eraIndex = currentEraOptional.unwrap()
    const historyDepth = (await api.query.staking.historyDepth()).toNumber();
    const dueEra = eraIndex.index.toNumber() - historyDepth;
    let payout = await ValidatorPayout.get(sha256(`${dueEra}${account}`))
    if(payout && payout.isClaimed === false){
        payout.isClaimed = true;
        payout.claimedAtBlockId = claimedBlockId;
        await payout.save();
    }
}

interface PayoutStaker {
    account: string,
    era: string
}

export function extractPayoutStakerFromCall(call: CallBase<AnyTuple>): PayoutStaker | undefined{
    if (call.section === 'staking' && call.method === "payoutStakers"){
        const account = call.args[0].toString();
        const era = call.args[1].toString();
        const payoutStaker: PayoutStaker = {account,era}
        return payoutStaker;
    }else{
        return
    }
}

function getPayoutCalls(payoutStakers:PayoutStaker[] ,childCall:CallBase<AnyTuple>, events: EventRecord[]): PayoutStaker []{
    if(childCall.section === 'staking' && childCall.method === "payoutStakers"){
        return payoutStakers.concat([extractPayoutStakerFromCall(childCall)]);
    }else{
        return payoutStakers.concat(flatten(extractPayoutStakersFromNestedCalls(childCall,events)));
    }
}

export function extractPayoutStakersFromNestedCalls(call: CallBase<AnyTuple>, events: EventRecord[]): PayoutStaker[]{
    const payoutStakers: PayoutStaker [] = [];
    if(
        (call.section === 'utility' && call.method === 'batch')
    ){
        const batchInterrupted = events.find(event=> event.event.section === "utility" && event.event.method === "BatchInterrupted");
        const childCalls = call.args[0] as Vec<CallBase<AnyTuple>>
        if(batchInterrupted){
            const [index] = batchInterrupted.event.data;
            const successCalls = childCalls.toArray().splice(Number(index));
            return payoutStakers.concat(successCalls.map((call) => extractPayoutStakerFromCall(call)));
        }else{
            return payoutStakers.concat(childCalls.map((call) => extractPayoutStakerFromCall(call)));
        }
    }
    if(
        (call.section === 'utility' && call.method === 'batchAll')
    ){
        const childCalls = call.args[0] as Vec<CallBase<AnyTuple>>;
        return payoutStakers.concat(childCalls.map((call) => extractPayoutStakerFromCall(call)));
    }
    if(call.section === 'utility' && call.method === 'asDerivative' ){
        const childCall = call.args[1] as CallBase<AnyTuple>;
        return getPayoutCalls(payoutStakers,childCall,events);
    }
    if(call.section === 'proxy' && call.method === 'proxy' ){
        const childCall = call.args[2] as CallBase<AnyTuple>;
        return getPayoutCalls(payoutStakers,childCall,events);
    }
    return payoutStakers;
}

async function updateValidatorPayout (era:string,validator: string, claimedAtBlockId: string, claimerId?:string): Promise<void>{
    const eraValidatorId = sha256(`${era}${validator}`)
    let payout = await ValidatorPayout.get(eraValidatorId);
    let eraValidator = await EraValidator.get(eraValidatorId)
    if(!payout){
        if(eraValidator){
            //Found Validator is in this era, but have no reward points (not record in erasRewardPoints)
            payout = new ValidatorPayout(eraValidatorId)
            payout.eraId = Number(era);
            payout.isClaimed = true;
            payout.validatorId = validator;
            payout.claimerId = claimerId;
            payout.claimedAtBlockId = claimedAtBlockId;
            // USE BN METHOD?
            payout.totalPayout = BigInt(0);
            await payout.save();
        }else{
            logger.error(`Can not find payout and validator ${validator} at era ${era}, id: ${eraValidatorId}`)
        }
    }
    else{
        // if(payout.isClaimed && payout.claimerId && payout.claimedAtBlockId)
        if(payout.isClaimed){
            return
        }else{
            payout.isClaimed = true;
            payout.claimerId = claimerId;
            payout.claimedAtBlockId = claimedAtBlockId;
            await payout.save();
        }
    }

}

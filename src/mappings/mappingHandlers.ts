import {SubstrateExtrinsic,SubstrateEvent,SubstrateBlock} from "@subql/types";
import {
    Account,
    AccountBalanceHistory,
    Asset,
    Block,
    Event,
    Extrinsic,
    LockedBalance,
    Phase,
    ExtrinsicV4,
    IdentityHistory
} from "../types";
import { Balance } from "@polkadot/types/interfaces";
import {extractRelatedAccountsFromBlock, extractRelatedAccountsFromEvent, getExtrinsicFee} from "./helper";
import { decodeAddress } from "@polkadot/util-crypto"
import { u8aToHex } from '@polkadot/util';


const eventsMapping = {
    'identity/IdentityCleared': handleIdentity,
    'identity/IdentityKilled': handleIdentity,
    'identity/IdentitySet': handleIdentity,
    'identity/JudgementGiven': handleIdentity,
    'identity/JudgementRequested': handleIdentity,
    'identity/JudgementUnrequested': handleIdentity,
    'identity/SubIdentityAdded': handleSubIdentity,
    'identity/SubIdentityRemoved': handleSubIdentity,
    'identity/SubIdentityRevoked': handleSubIdentity,

};


export async function handleBlock(block: SubstrateBlock): Promise<void> {
    const record = new Block(block.block.header.number.toString());
    record.hash = block.block.header.hash.toString();
    record.timestamp = block.timestamp;
    const accounts = await extractRelatedAccountsFromBlock(block);
    if(accounts.length!==0){
        for (const account of accounts){
            //update account balance here
        }
    }
    await record.save();
}

function getEventId(event: SubstrateEvent): string {
    return `${event.block.block.header.number.toString()}-${event.idx.toString()}`
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
    const eventId = getEventId(event);
    let record = await Event.get(eventId);
    const relatedAccounts = extractRelatedAccountsFromEvent(event);
    if(record === undefined){
        record = new Event(eventId);
        record.module = event.event.section;
        record.event = event.event.method;
        record.blockId = event.block.block.header.number.toString();
        record.extrinsicId = event.extrinsic?.extrinsic.hash.toString();
        record.phase = {
            isApplyExtrinsic: event.phase.isApplyExtrinsic,
            isFinalization: event.phase.isFinalization,
            isInitialization: event.phase.isInitialization,
        };
        record.topics = event.topics.map(topic=>topic.toString());
        record.parameters = event.event.data.toString();
        record.timestamp = event.block.timestamp;
        record.relatedAccounts = relatedAccounts;
        await record.save();
    }
    await processEvent(event);
}

export async function processEvent(event: SubstrateEvent): Promise<void> {
    const {
        event: { method, section },
    } = event;
    const eventType = `${section}/${method}`;
    const handler = eventsMapping[eventType];
    if (handler) {
        await handler(event);
    }
}

export async function handleExtrinsic(extrinsic: SubstrateExtrinsic): Promise<void> {
    const thisExtrinsic = await Extrinsic.get(extrinsic.extrinsic.hash.toString());
    if(thisExtrinsic === undefined) {
        const record = new Extrinsic(extrinsic.extrinsic.hash.toString());
        record.module = extrinsic.extrinsic.method.section;
        record.call = extrinsic.extrinsic.method.method;
        record.blockId = extrinsic.block.block.header.number.toString();
        record.isSuccess = extrinsic.success;
        record.isSigned = extrinsic.extrinsic.isSigned;
        record.nonce = extrinsic.extrinsic.nonce.toNumber();
        if(extrinsic.extrinsic.isSigned && extrinsic.extrinsic.signer){
            record.signature = extrinsic.extrinsic.signature.toString()
            record.signatureType = (extrinsic.extrinsic as any)._raw.signature.multiSignature.type
            extrinsic.extrinsic.toRawType()
            const signer = await getOrCreateAccount(extrinsic.extrinsic.signer.toString());
            record.signerId = signer.id;
        }
        record.extra = await handleExtrinsicExtra(extrinsic);
        record.version = extrinsic.extrinsic.version;
        record.timestamp = extrinsic.block.timestamp;
        await record.save()
    }
}

async function handleExtrinsicExtra (extrinsic: SubstrateExtrinsic): Promise<string>{
    const extrinsicHex = extrinsic.extrinsic.toHex();
    let extrinsicFee: bigint;
    let lifetime: number[]|undefined;
    if(extrinsic.extrinsic.isSigned){
        extrinsicFee = await getExtrinsicFee(extrinsicHex, extrinsic.block.block.hash.toString())
        lifetime = extrinsic.extrinsic.era.isMortalEra ? [extrinsic.extrinsic.era.asMortalEra.birth(extrinsic.block.block.header.number.toNumber()),
            extrinsic.extrinsic.era.asMortalEra.death(extrinsic.block.block.header.number.toNumber())]: undefined
    }
    const extrinsicExtra: ExtrinsicV4 = {
        parameters : extrinsic.extrinsic.method.args.toString(),
        fee: extrinsicFee?.toString(),
        tip: extrinsic.extrinsic.isSigned? extrinsic.extrinsic.tip.toBigInt().toString():null,
        lifetime: lifetime,
        extension: `{}`
    }
    return JSON.stringify(extrinsicExtra);
}

//get or create account
async function getOrCreateAccount(accountId: string): Promise<Account>{
    let account = await Account.get(accountId);
    if(account === undefined){
        account = new Account(accountId);
        account.pubKey = u8aToHex(decodeAddress(accountId));
    }
    const { nonce } = await api.query.system.account(accountId);
    account.nextNonce = nonce? nonce.toNumber():0;
    await account.save()
    return account;
}

async function handleIdentity(event: SubstrateEvent):Promise<void>{
    const {event: {data: [account]}} = event;
    await updateIdentity(account.toString());
}

async function handleSubIdentity(event: SubstrateEvent):Promise<void>{
    const {event: {data: [sub, main,]}} = event;
    await updateIdentity(sub.toString());
    await updateIdentity(main.toString());
}

async function updateIdentity(accountId: string):Promise<void>{
    const account = await getOrCreateAccount(accountId);
    const chainIdentity = await api.query.identity.identityOf(accountId)
    if(chainIdentity.isNone){
        return
    }
    const identity = Object.assign({} as IdentityHistory, chainIdentity.unwrap().toJSON());
    if(account.identity==null){
        account.identity = [];
    }
    account.identity.push(identity);
    await account.save();
}




// async function newAccountBalance(accountId:string, assetId : number, freeAmount: bigint, reservedAmount: bigint, locked?:string ): Promise<AccountBalance>{
//     const accountBalance = new AccountBalance(`${accountId}-${assetId}`);
//     let asset = await Asset.get(assetId.toString());
//     if(asset === undefined){
//         const thisAsseet = await api.query.assets.metadata(assetId);
//         asset = newAsset(
//             assetId.toString(),
//             thisAsseet.symbol.toString(),
//             thisAsseet.decimals.toNumber(),
//             (thisAsseet.deposit as Balance).toBigInt()
//         )
//         await asset.save()
//     }
//     accountBalance.accoutId = accountId;
//     accountBalance.assetId = assetId.toString();
//     accountBalance.reservedAmount = reservedAmount;
//     accountBalance.freeAmount = freeAmount;
//     accountBalance.locked = null;
//     return accountBalance;
// }
//
// async function updateAccountBalance(accountId:string, assetId: number){
//     const { nonce, data: {free,reserved,miscFrozen,feeFrozen}} = await api.query.system.account(accountId.toString());
//     let accountBalance = await AccountBalance.get(`${accountId}-${assetId}`);
//     if(accountBalance === undefined){
//         accountBalance = await newAccountBalance(accountId, assetId, (free as Balance).toBigInt(),(reserved as Balance).toBigInt())
//     }
//     accountBalance.freeAmount = (free as Balance).toBigInt();
//     accountBalance.reservedAmount = (reserved as Balance).toBigInt();
//     const locked = await api.query.balances.locks(accountId);
//     if (locked !== undefined){
//         accountBalance.locked = locked.map(lock=>{
//             return {
//                 id: lock.id.toString(),
//                 amount: lock.amount.toBigInt(),
//                 reasons: lock.reasons.toString()};
//         })
//     }
//     await accountBalance.save();
// }

// function newAsset(id:string, symbol :string,decimal: number, totalIssuance?: bigint):Asset {
//     const asset = new Asset(id);
//     asset.symbol = symbol;
//     asset.decimal = decimal;
//     asset.totalIssuance = totalIssuance;
//     return asset;
// }

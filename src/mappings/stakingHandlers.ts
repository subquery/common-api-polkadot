import { SubstrateEvent } from "@subql/types";
import { sha256 } from 'js-sha256';
import { Era } from "../types/models/Era";
import { NominatorValidator } from '../types/models/NominatorValidator';
import {getOrCreateAccount} from "./identityHandlers"
export async function handleSession(event:SubstrateEvent): Promise<void> {
    let previousEra:Era;
    const currentEra = await api.query.staking.currentEra();
    const currentBlock =  event.block.block.header.number.toNumber();
    const currentEraNum = currentEra.unwrap().toNumber();
    if(currentEra.isNone) return;
    const eraSaved = await Era.get(currentEraNum.toString());
    if (eraSaved) {
        return
    }
    if (!eraSaved){
        const newEra = new Era(currentEraNum.toString());
        newEra.startBlock = currentBlock;
        await newEra.save();
        const previousEraIndex =  currentEraNum-1;
        previousEra = await Era.get(previousEraIndex.toString());
        if(previousEra){
            previousEra.endBlock = currentBlock - 1;
            await previousEra.save();
        }
    }
    const validators = await api.query.session.validators();
    for (const validator of validators){
        const validatorId = validator.toString();
        const validatorExposure =  await api.query.staking.erasStakers(currentEraNum, validatorId);
        const { others } = validatorExposure;
        const valAccount = await getOrCreateAccount(validatorId)
        for (const nominator of others) {
            const nominatorId = nominator.who.toString();
            logger.info(`validator: ${validatorId}, nominator: ${nominatorId}`)
            const nomAccount = await getOrCreateAccount(nominatorId);
            const nominatorValidatorId: string = sha256(`${currentEraNum}${nomAccount.id}${valAccount.id}`);
            const eraNominatorValidator = await NominatorValidator.get(nominatorValidatorId);
            if (!eraNominatorValidator) {
                const currNominatorValidator = new NominatorValidator(nominatorValidatorId);
                currNominatorValidator.eraId = currentEraNum.toString();
                currNominatorValidator.nominatorId = nominatorId;
                currNominatorValidator.validatorId = validatorId;
                await currNominatorValidator.save();
            }
        }
    }

}

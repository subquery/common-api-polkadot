import { SubstrateEvent } from "@subql/types";
import { sha256 } from 'js-sha256';
import { Era } from "../types/models/Era";
import { NominatorValidator } from '../types/models/NominatorValidator';
import {getOrCreateAccount} from "./identityHandlers"
import { EraIndex, Exposure } from "@polkadot/types/interfaces";
import { EraValidator } from "../types";

export async function handleSession(event: SubstrateEvent): Promise<void> {
    const currentEraOptional = await api.query.staking.currentEra();
    if (currentEraOptional.isNone) return;

    const currentBlockNumber = event.block.block.header.number.toNumber();
    const currentEra = currentEraOptional.unwrap()
    
    await saveCurrentEra(currentEra, currentBlockNumber);
    await saveValidators(currentEra.toNumber());
}

async function saveCurrentEra(currentEra: EraIndex, blockNumber: number) {
    let currentEraNumber = currentEra.toNumber()
    let currentEraString = currentEra.toString()

    const eraSaved = await Era.get(currentEraString);
    if (eraSaved) {
        return
    } else {
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
}

async function saveValidators(currentEraNumber: number) {
    let exposures = await api.query.staking.erasStakers.entries(currentEraNumber);

    exposures.map(async ([key, exposure]) => {
        const [, validatorId] = key.args

        let validatorIdString = validatorId.toString()

        await saveEraValidator(currentEraNumber, exposure, validatorIdString);
        await saveNominatorValidator(currentEraNumber, exposure, validatorIdString);
    })
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
    eraValidator.total = exposure.total.toString()
    eraValidator.own = exposure.own.toString()
    eraValidator.others = exposure.others.map(other => {
        return {
            nominator: other.who.toString(),
            value: other.value.toString()
        }
    })

    await eraValidator.save().catch(e => { logger.error(e) })
}

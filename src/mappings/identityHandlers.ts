import {Account, IdentityHistory} from "../types";
import {SubstrateEvent} from "@subql/types/dist";
import { decodeAddress } from "@polkadot/util-crypto"
import { u8aToHex } from '@polkadot/util';

export async function handleIdentity(event: SubstrateEvent):Promise<void>{
    const {event: {data: [account]}} = event;
    await updateIdentity(account.toString());
}

export async function handleSubIdentity(event: SubstrateEvent):Promise<void>{
    const {event: {data: [sub, main,]}} = event;
    await updateIdentity(sub.toString());
    await updateIdentity(main.toString());
}

async function updateIdentity(accountId: string):Promise<void>{
    const account = await getOrCreateAccount(accountId);
    if (!api.query.identity || !api.query.identity.identityOf) return;
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

//get or create account
export async function getOrCreateAccount(accountId: string): Promise<Account>{
    let account = await Account.get(accountId);
    if(account === undefined){
        account = new Account(accountId);
        account.pubKey = u8aToHex(decodeAddress(accountId));
    }
    if(!api.query.system.account){
        account.nextNonce = 0;
    }else{
        const { nonce } = await api.query.system.account(accountId);
        account.nextNonce = nonce? nonce.toNumber():0;
    }
    await account.save()
    return account;
}


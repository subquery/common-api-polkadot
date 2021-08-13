import {SubstrateExtrinsic,SubstrateEvent,SubstrateBlock} from "@subql/types";
import { uniq, flatten } from "lodash";
import {Balance} from "@polkadot/types/interfaces";
import {extractAuthor} from "@polkadot/api-derive/type/util"
import { AnyTuple, CallBase } from '@polkadot/types/types';
import { Vec } from '@polkadot/types';

const ACCOUNT_TYPES= ["Address","LookupSource","AccountId"]


export async function extractRelatedAccountsFromBlock (block: SubstrateBlock): Promise<string[]> {
    const accounts: string[] = [];
    const validators = await api.query.session.validators();
    const blockAuthor = extractAuthor(block.block.header.digest, validators);
    if(blockAuthor){
        accounts.push(blockAuthor.toString());
    }

    if(block.events.length!==0){
        for (const event of block.events){
            for (const [key, typeDef] of Object.entries(event.event.data.typeDef)){
                if(ACCOUNT_TYPES.includes(typeDef.type)){
                    const index = Number(key);
                    accounts.push(event.event.data[index].toString());
                }
            }
        }
    }

    if (block.block.extrinsics.length!==0){
        for (const extrinsic of block.block.extrinsics){
            for (const account of flatten(extractAccountsFromNestedCalls(extrinsic.method))){
                accounts.push(account);
            }
        }
    }

    return uniq(accounts);
}

export function extractAccountsFromNestedCalls(call: CallBase<AnyTuple>): string[]{
    const accounts= [] as string[];
    for (const [key, arg] of Object.entries(call.meta.args.toArray())){
        if(arg.type && ACCOUNT_TYPES.includes(arg.type.toString())){
            const index = Number(key);
            accounts.push(call.args[index].toString());
        }
        if(
            (call.section === 'utility' && call.method === 'batchAll')||
            (call.section === 'utility' && call.method === 'batch')
        ){
            const calls = call.args[0] as Vec<CallBase<AnyTuple>>;
            return accounts.concat(
                flatten(
                    calls.map((call) => extractAccountsFromNestedCalls(call)),
                ),
            );
        }
        if(call.section === 'utility' && call.method === 'asDerivative' ){
            const childCall = call.args[1] as CallBase<AnyTuple>;
            return accounts.concat(
                flatten(
                    extractAccountsFromNestedCalls(childCall),
                ),
            );
        }
        if(call.section === 'proxy' && call.method === 'proxy' ){
            const childCall = call.args[2] as CallBase<AnyTuple>;
            return accounts.concat(
                flatten(
                    extractAccountsFromNestedCalls(childCall),
                ),
            );
        }
    }
    return accounts;
}

export function extractRelatedAccountsFromEvent (event: SubstrateEvent): string[]{
    const accounts: string[] = [];
    let extrinsic = event.extrinsic?.extrinsic
    if(!extrinsic){
        return accounts
    }
    let signer = extrinsic.signer
    if (extrinsic.isSigned && signer) {
        accounts.push(signer.toString())
    }
    for (const [key, typeDef] of Object.entries(event.event.data.typeDef)){
        if(ACCOUNT_TYPES.includes(typeDef.type)){
            const index = Number(key);
            accounts.push(event.event.data[index].toString());
        }
    }
    return uniq(accounts);
}


export async function getExtrinsicFee(extrinsicHex: string, blockHash: string): Promise<bigint>{
    const { partialFee } = await api.rpc.payment.queryInfo(extrinsicHex, blockHash)
    return (partialFee as Balance).toBigInt();
}

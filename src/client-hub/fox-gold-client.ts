"use client";
import {getFunctions,httpsCallable} from 'firebase/functions';
import {hubCallableOwnerSession} from './callable-owner-session';
import {CLIENT_HUB_FUNCTIONS_REGION,verifiedClientHubConnection} from './client';
import {assertClientHubProjectId,clientHubObject,ClientHubDataError} from './model';
import {decodeFoxBank,type FoxBank,type FoxRoll} from '@/components/fox-gold-bank';
export async function resolveFoxGoldSession(owner:boolean,signal?:AbortSignal){
 if(signal?.aborted)throw new DOMException('Request cancelled.','AbortError');
 const clientConnection=owner?null:await verifiedClientHubConnection(signal,false);
 const session=clientConnection??await hubCallableOwnerSession();
 const uid=session.auth.currentUser?.uid;
 const clientSession=clientConnection?.session;
 if(!owner&&(!clientSession||typeof clientSession.clientId!=="string"||!Number.isSafeInteger(clientSession.authVersion)))throw new ClientHubDataError('The gold account scope could not be verified.');
 const scopeKey=owner?JSON.stringify(['owner',uid]):JSON.stringify(['client',uid,clientSession!.clientId,clientSession!.authVersion]);
 const assertCurrent=()=>{if(signal?.aborted)throw new DOMException('Request cancelled.','AbortError');session.assertCurrent();if(!uid||session.auth.currentUser?.uid!==uid)throw new ClientHubDataError('Your gold account session changed.');};
 assertCurrent();return{uid:uid!,scopeKey,auth:session.auth,assertCurrent};
}
async function call(owner:boolean,name:string,input:unknown,signal?:AbortSignal,expectedScope?:string){
 if(signal?.aborted)throw new DOMException('Request cancelled.','AbortError');
 const session=await resolveFoxGoldSession(owner,signal);
 if(expectedScope!==undefined&&session.scopeKey!==expectedScope)throw new ClientHubDataError('Your gold account changed. Reopen the game.');
 const assertCurrent=session.assertCurrent;
 assertCurrent();const result=await httpsCallable<unknown,unknown>(getFunctions(session.auth.app,CLIENT_HUB_FUNCTIONS_REGION),name)(input);assertCurrent();return clientHubObject(result.data);
}
export async function getAccountFoxGold(owner:boolean,signal?:AbortSignal):Promise<FoxBank>{const result=await call(owner,'tmcHubGetFoxGold',{},signal);if(!result.bank)throw new ClientHubDataError('The gold balance could not be verified.');return decodeFoxBank(JSON.stringify(result.bank));}
/** Preserve operationId after uncertainty; a retry returns the original roll, never a new draw. */
export type AccountFoxRoll = FoxRoll & {currentBank:FoxBank};
export async function rollAccountFoxGold(owner:boolean,operationId:string,signal?:AbortSignal,expectedScope?:string):Promise<AccountFoxRoll>{
 assertClientHubProjectId(operationId);if(!expectedScope)throw new ClientHubDataError('Verify the gold account before rolling.');const result=await call(owner,'tmcHubRollFoxGold',{operationId,expectedScope},signal,expectedScope);
 if(!result.bank||!Number.isSafeInteger(result.delta)||Number(result.delta)<-34||Number(result.delta)>20)throw new ClientHubDataError('The gold roll could not be verified.');
 const bank=decodeFoxBank(JSON.stringify(result.bank));if(bank.revision<1||bank.balance-Number(result.delta)<0||bank.balance-Number(result.delta)>999)throw new ClientHubDataError('The gold roll could not be verified.');if(!result.currentBank)throw new ClientHubDataError('The current gold balance could not be verified.');const currentBank=decodeFoxBank(JSON.stringify(result.currentBank));if(currentBank.revision<bank.revision||currentBank.revision===bank.revision&&currentBank.balance!==bank.balance)throw new ClientHubDataError('The gold history could not be verified.');return{bank,delta:Number(result.delta),currentBank};
}

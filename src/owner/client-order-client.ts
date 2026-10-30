"use client";
import {getFunctions,httpsCallable} from 'firebase/functions';
import {hubCallableOwnerSession} from '@/client-hub/callable-owner-session';
import {CLIENT_HUB_FUNCTIONS_REGION} from '@/client-hub/client';
import {assertClientHubProjectId,clientHubObject} from '@/client-hub/model';
import {decodeClientOrder,type SaveClientOrderInput} from './client-order';
export async function getOwnerClientOrder(){const session=await hubCallableOwnerSession();session.assertCurrent();const result=await httpsCallable(getFunctions(session.auth.app,CLIENT_HUB_FUNCTIONS_REGION),'tmcOwnerGetClientOrder')({});session.assertCurrent();return decodeClientOrder(clientHubObject(result.data).order);}
export async function saveOwnerClientOrder(input:SaveClientOrderInput){assertClientHubProjectId(input.operationId);decodeClientOrder({schemaVersion:1,revision:input.expectedRevision,updatedAt:null,clientIds:input.clientIds});const session=await hubCallableOwnerSession();session.assertCurrent();const result=await httpsCallable(getFunctions(session.auth.app,CLIENT_HUB_FUNCTIONS_REGION),'tmcOwnerSaveClientOrder')(input);session.assertCurrent();const saved=decodeClientOrder(clientHubObject(result.data).order);if(saved.revision!==input.expectedRevision+1||JSON.stringify(saved.clientIds)!==JSON.stringify(input.clientIds))throw Error('Client order could not be confirmed. Retry this same save or refresh.');return saved;}

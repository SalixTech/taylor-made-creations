// Explicit local-only storage + verified-identity fixture for workspace handler tests.
export function chatDraftStorageFixture(h) {
 const values=new Map();h.window.localStorage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 return {verifiedHubChatDraftScope:async(project,owner)=>({key:`tmc-maker-chat-text-v1:${owner?'owner':'client'}:${project.clientId}:${project.projectId}`,assertCurrent(){}})};
}

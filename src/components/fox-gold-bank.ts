/** Shared safe bank shape; anonymous rolls live only in component memory. */
export type FoxBank={schemaVersion:1;balance:number;revision:number};
export const FOX_EVENTS=['ordinary','pocket-inspector','bubble-enthusiast','management','keeper','trustworthy-thief','bubbles-wipe'] as const;
export type FoxEvent=typeof FOX_EVENTS[number];
export type FoxRoll={bank:FoxBank;delta:number;gameVersion?:2;event?:FoxEvent};
export function decodeFoxBank(raw:string|null):FoxBank{
 if(raw===null)return{schemaVersion:1,balance:0,revision:0};
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('Saved fox gold could not be read.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Saved fox gold could not be read.');
 const row=value as Record<string,unknown>;
 if(Object.keys(row).length!==3||row.schemaVersion!==1||!Number.isSafeInteger(row.balance)||Number(row.balance)<0||Number(row.balance)>999||!Number.isSafeInteger(row.revision)||Number(row.revision)<0||Number(row.revision)>=Number.MAX_SAFE_INTEGER)throw Error('Saved fox gold could not be read.');
 return row as FoxBank;
}
/** Even odds; a win draws 1–20, a loss 3–34. Display only the applied delta. */
export function nextFoxRoll(bank:FoxBank,random:()=>number=Math.random):FoxRoll{
 decodeFoxBank(JSON.stringify(bank));if(bank.revision>=Number.MAX_SAFE_INTEGER-1)throw Error('Saved fox gold needs attention.');const win=random(),amount=random();
 if(!Number.isFinite(win)||win<0||win>=1||!Number.isFinite(amount)||amount<0||amount>=1)throw Error('The fox could not roll this time.');
 const requested=win<.5?1+Math.floor(amount*20):-(3+Math.floor(amount*32));
 const balance=Math.max(0,Math.min(999,bank.balance+requested));
 return{bank:{schemaVersion:1,balance,revision:bank.revision+1},delta:balance-bank.balance};
}
export type FoxAnonymousMemory={read:()=>FoxBank|null;write:(bank:FoxBank)=>void;readRoll:(openingId:string)=>FoxRoll|null;writeRoll:(openingId:string,roll:FoxRoll)=>void};
const gains=['Hemlo! I found {amount} shiny gold in the bubbles. You can have it. It tastes terrible.','You saw nothing. Especially these {amount} gold. Fair trade?','I was saving this for snacks, but you seem nice. Take {amount} gold.'];
const losses=['Hemlo! Small problem. I ordered more bubbles. Your {amount} gold helped. Thank you for your generosity.','I borrowed {amount} gold. Borrowed is a very flexible word.','The bubbles demanded a tribute. Unfortunately, it was {amount} of your gold.','You’ve been robbed. {amount} gold. By this face. Embarrassing, really.','Your pockets looked heavy. I fixed that. You’re welcome. −{amount} gold.','I said ‘Hemlo,’ not ‘I’m trustworthy.’ That’ll be {amount} gold.'];
export function foxOutcomeLine(roll:FoxRoll,encounter=0){if(roll.delta===0)return roll.bank.balance===0?'I checked your pockets. Just lint. We shall try again later.':'Hemlo. Your gold stayed right where it was. Suspiciously tidy.';const lines=roll.delta>0?gains:losses,index=Number.isSafeInteger(encounter)&&encounter>=0?encounter%lines.length:0;return lines[index].replaceAll('{amount}',String(Math.abs(roll.delta)));}
/** One real open owns one account scope and one operation, even across child remounts. */
export type FoxOpening={id:string;operation:(scope:string,pending:string|null)=>string;rare:(random?:()=>number)=>boolean};
export function createFoxOpening(id:string):FoxOpening{let pinnedScope:string|undefined,operationId:string|undefined,rareChoice:boolean|undefined;return{id,rare(random=Math.random){if(rareChoice===undefined){const draw=random();rareChoice=Number.isFinite(draw)&&draw>=0&&draw<.01;}return rareChoice;},operation(scope,pending){if(pinnedScope!==undefined&&pinnedScope!==scope)throw Error('The account changed during this visit.');if(operationId!==undefined&&pending!==null&&pending!==operationId)throw Error('Another roll is pending.');pinnedScope=scope;operationId??=pending??id;return operationId;}};}

export const FOX_RARE_LINE="Name’s Bubbles. Professional pocket inspector. Unlicensed bubble enthusiast. You’ve met the management.";

/** v2: server-equivalent integer draws, 65/35 ordinary odds, boundary direction.
 * Rare event is 1/100; each of six rare titles is equiprobable (wipe1/600). */
export function nextFoxRollV2(bank:FoxBank,random:()=>number=Math.random):FoxRoll{
 decodeFoxBank(JSON.stringify(bank));if(bank.revision>=Number.MAX_SAFE_INTEGER-1)throw Error('Saved fox gold needs attention.');
 const limits=[100,6,100,640],draws=limits.map(limit=>{const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('The fox could not roll this time.');return Math.floor(value*limit);});
 const event:FoxEvent=draws[0]===0?FOX_EVENTS[draws[1]+1]:'ordinary';
 const win=bank.balance===0?true:bank.balance===999?false:draws[2]<65;
 const requested=event==='bubbles-wipe'?-bank.balance:win?1+draws[3]%20:-(3+draws[3]%32);
 const balance=Math.max(0,Math.min(999,bank.balance+requested));
 return{bank:{schemaVersion:1,balance,revision:bank.revision+1},delta:balance-bank.balance,gameVersion:2,event};
}
export function foxRareLine(event:FoxEvent):string{
 const titles:Record<FoxEvent,string>={ordinary:'', 'pocket-inspector':'Professional pocket inspector.', 'bubble-enthusiast':'Unlicensed bubble enthusiast.',management:'You’ve met the management.',keeper:'Keeper of da bubblz.','trustworthy-thief':'This face is trustworthy as a thief.','bubbles-wipe':'You touched my bubbles.'};
 return `Name’s Bubbles. ${titles[event]}`;
}

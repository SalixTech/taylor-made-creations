/** A deliberately small import language. Raw HTML/CSS is never saved or executed. */
export const BUTTON_PRESETS = ["solid", "outline", "plain", "raised", "pill"] as const;
export type ButtonPreset = typeof BUTTON_PRESETS[number];
export const BUTTON_STYLE_KEYS = ["color","backgroundColor","backgroundImage","borderColor","borderWidth","borderStyle","borderRadius","paddingInline","paddingBlock","fontSize","fontWeight","letterSpacing","textTransform","boxShadow","transition"] as const;
export type ButtonStyleRecord = Partial<Record<typeof BUTTON_STYLE_KEYS[number],string>>;
export type ButtonAppearance = {preset:ButtonPreset;artwork?:{src:string};imported?:ButtonStyleRecord;hover?:ButtonStyleRecord;focus?:ButtonStyleRecord};
const keys: Record<string,keyof ButtonStyleRecord> = Object.fromEntries(BUTTON_STYLE_KEYS.map(key=>[key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`),key]));
const hex = /^(?:#[\da-f]{3}|#[\da-f]{6}|#[\da-f]{8}|transparent|black|white|red|blue|green|yellow|orange|purple|pink|gray|grey)$/i;
function color(value:string):boolean {
 if(hex.test(value))return true;
 const match=value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?\s*\)$/);
 return !!match&&[match[1],match[2],match[3]].every(v=>Number(v)<=255)&&(value.startsWith("rgba")?match[4]!==undefined:match[4]===undefined);
}
function splitCommas(value:string):string[]{return value.split(/,(?![^()]*\))/).map(item=>item.trim());}
function safeValue(key:string,value:unknown):value is string {
 if(typeof value!=="string"||value.length>240)return false;
 if(["color","backgroundColor","borderColor"].includes(key))return color(value);
 if(key==="backgroundImage") {const match=value.match(/^linear-gradient\((\d{1,3})deg,\s*(.+)\)$/);if(!match||Number(match[1])>360)return false;const stops=splitCommas(match[2]);return stops.length>=2&&stops.length<=4&&stops.every(stop=>color(stop));}
 if(key==="borderStyle")return /^(?:solid|dashed|dotted|none)$/.test(value);
 if(key==="fontWeight")return /^(?:normal|bold|[1-9]00)$/.test(value);
 if(key==="textTransform")return /^(?:none|uppercase|lowercase|capitalize)$/.test(value);
 if(key==="transition")return splitCommas(value).length<=5&&splitCommas(value).every(item=>/^(?:color|background-color|border-color|box-shadow|letter-spacing) (?:[1-9]\d?|[1-4]\d{2}|500)ms(?: (?:ease|linear|ease-in|ease-out|ease-in-out))?$/.test(item));
 if(key==="boxShadow") {
  if(value==="none")return true;
  const shadows=splitCommas(value);return shadows.length<=3&&shadows.every(shadow=>{const match=shadow.match(/^(?:inset )?((?:(?:-?\d{1,2}(?:\.\d{1,2})?px|0) ){2,4})(.+)$/);return !!match&&color(match[2])&&match[1].trim().split(/\s+/).every(v=>Math.abs(parseFloat(v))<=24);});
 }
 if(!["borderWidth","borderRadius","paddingInline","paddingBlock","fontSize","letterSpacing"].includes(key))return false;
 const match=value.match(/^(0|\d{1,3}(?:\.\d{1,2})?)(px)?$/);if(!match||(!match[2]&&Number(match[1])!==0))return false;
 const px=Number(match[1]),maximum=key==="borderWidth"?12:key==="letterSpacing"?8:key==="fontSize"?72:128;
 return px<=maximum&&(key!=="fontSize"||px>=8);
}
export function validateButtonStyle(value:unknown):value is ButtonStyleRecord {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const entries=Object.entries(value);return entries.length>0&&entries.length<=BUTTON_STYLE_KEYS.length&&entries.every(([key,item])=>BUTTON_STYLE_KEYS.includes(key as keyof ButtonStyleRecord)&&safeValue(key,item));
}
function declarations(source:string):ButtonStyleRecord {
 const style:ButtonStyleRecord={};
 function put(key:keyof ButtonStyleRecord,value:string){if(!safeValue(key,value))throw new Error(`Unsupported value for ${key}: ${value}. Use bounded pixels, supported colors or a simple gradient/shadow.`);if(Object.hasOwn(style,key))throw new Error(`Duplicate style: ${key}.`);style[key]=value;}
 for(const declaration of source.split(";")) {
  if(!declaration.trim())continue;
  const pair=declaration.trim().match(/^([a-z-]+)\s*:\s*([^:]+)$/);if(!pair)throw new Error(`Unsupported declaration: ${declaration.trim()}.`);
  const property=pair[1],value=pair[2].trim();
  if(property==="padding") {const parts=value.split(/\s+/);if(parts.length<1||parts.length>2)throw new Error("Padding supports one or two pixel values.");put("paddingBlock",parts[0]);put("paddingInline",parts[1]??parts[0]);}
  else if(property==="border") {if(value==="0"||value==="none"){put("borderWidth","0");put("borderStyle","none");}else{const match=value.match(/^(\d{1,2}px) (solid|dashed|dotted) (.+)$/);if(!match)throw new Error("Border supports a pixel width, solid/dashed/dotted and a color.");put("borderWidth",match[1]);put("borderStyle",match[2]);put("borderColor",match[3]);}}
  else if(property==="background")put(value.startsWith("linear-gradient(")?"backgroundImage":"backgroundColor",value);
  else {const key=keys[property];if(!key)throw new Error(`Unsupported button style: ${property}. Layout positioning, external resources and animations are not imported.`);put(key,value);}
 }
 if(!validateButtonStyle(style))throw new Error("Add at least one supported style declaration.");return style;
}
export function parseButtonImport(html:string,css:string):{label:string;style:ButtonStyleRecord;hover?:ButtonStyleRecord;focus?:ButtonStyleRecord} {
 if(html.length>4000||css.length>6000)throw new Error("Use one short button (HTML 4,000 / CSS 6,000 characters maximum).");
 if(/[&\\]/.test(html)||/[\\@<>]/.test(css)||/\/\*|\*\/|url\s*\(|var\s*\(|attr\s*\(|!important/i.test(css))throw new Error("Escapes, entities, at-rules, comments, URLs and dynamic CSS are not supported.");
 const root=html.trim().match(/^<button(?:\s+class=(?:"([a-zA-Z][\w-]*)"|'([a-zA-Z][\w-]*)'))?\s*>([\s\S]*?)<\/button>$/);
 if(!root)throw new Error("Use one <button> with an optional single class. Links, attributes, scripts and event handlers are not imported.");
 const text=root[3].replace(/<span>([^<>]*)<\/span>/g,"$1");if(/[<>]/.test(text)||!text.trim()||text.trim().length>150)throw new Error("The button may contain plain text or text-only spans (up to 150 characters).");
 const className=root[1]??root[2],allowed=["button",className?`.${className}`:""].filter(Boolean),result:{label:string;style:ButtonStyleRecord;hover?:ButtonStyleRecord;focus?:ButtonStyleRecord}={label:text.trim(),style:{}};
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 if(!rules.length||rules.length>3||rules.map(rule=>rule[0]).join("").replace(/\s/g,"")!==css.replace(/\s/g,""))throw new Error("Use one base rule, optional :hover and :focus-visible. Nested rules and animations are unsupported.");
 const seen=new Set<string>();
 for(const rule of rules){const selector=rule[1].trim(),state=selector.endsWith(":hover")?"hover":selector.endsWith(":focus-visible")?"focus":"style",base=selector.replace(/:(?:hover|focus-visible)$/,"");if(!allowed.includes(base)||seen.has(state))throw new Error(`Unsupported or duplicate selector: ${selector}. Only this button's base, hover and focus-visible states are supported.`);seen.add(state);result[state]=declarations(rule[2]);}
 if(!seen.has("style"))throw new Error("Include the button's base style rule.");return result;
}

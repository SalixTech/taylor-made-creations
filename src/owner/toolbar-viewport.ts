/** Center tools over the edited website canvas, excluding the inspector. */
export function visibleToolbarFrame({left,width,localWidth,viewportLeft,viewportWidth,canvasLeft=left,canvasWidth=width}:{left:number;width:number;localWidth:number;viewportLeft:number;viewportWidth:number;canvasLeft?:number;canvasWidth?:number}):{width:number;offset:number}|null{
 if(![left,width,localWidth,viewportLeft,viewportWidth,canvasLeft,canvasWidth].every(Number.isFinite)||width<=0||localWidth<=0||viewportWidth<=0||canvasWidth<=0)return null;
 const scale=width/localWidth,start=Math.max(left,canvasLeft,viewportLeft),end=Math.min(left+width,canvasLeft+canvasWidth,viewportLeft+viewportWidth);
 if(end<=start)return null;
 return {width:(end-start)/scale,offset:(start-left)/scale};
}
/** Layout-only observer: never changes content, selection, scroll position or focus. */
export function trackToolbarViewport(root:HTMLElement,bar:HTMLElement,canvas?:HTMLElement|null):()=>void{
 const viewport=window.visualViewport;
 const measure=()=>{
  const rect=root.getBoundingClientRect(),canvasRect=canvas?.getBoundingClientRect(),scale=root.offsetWidth>0?rect.width/root.offsetWidth:1;
  const frame=visibleToolbarFrame({left:rect.left+root.clientLeft*scale,width:root.clientWidth*scale,localWidth:root.clientWidth,canvasLeft:canvasRect?.left,canvasWidth:canvasRect?.width,viewportLeft:viewport?.offsetLeft??0,viewportWidth:viewport?.width??(document.documentElement?.clientWidth||window.innerWidth)});
  if(frame){bar.style.setProperty('--builder-toolbar-visible-width',`${frame.width}px`);bar.style.setProperty('--builder-toolbar-visible-offset',`${frame.offset}px`);}
  else{bar.style.removeProperty('--builder-toolbar-visible-width');bar.style.removeProperty('--builder-toolbar-visible-offset');}
  root.style.setProperty('--builder-toolbar-height',`${bar.getBoundingClientRect().height}px`);
 };
 measure();
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
 observer?.observe(root);observer?.observe(bar);if(canvas)observer?.observe(canvas);
 window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
 viewport?.addEventListener('resize',measure);viewport?.addEventListener('scroll',measure);
 return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);viewport?.removeEventListener('resize',measure);viewport?.removeEventListener('scroll',measure);bar.style.removeProperty('--builder-toolbar-visible-width');bar.style.removeProperty('--builder-toolbar-visible-offset');};
}

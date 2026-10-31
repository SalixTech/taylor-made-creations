"use client";
import {createContext,useContext,type ReactNode} from 'react';
import type {CanvasPlacement} from '@/owner/canvas-layout';
export type CanvasSceneNodeContext={id:string;scope:'page'|'chrome';styleTarget:string;placement?:CanvasPlacement;outerFrame:boolean;childSlot?:ReactNode};
export const CanvasSceneContext=createContext<CanvasSceneNodeContext|null>(null);
export function useCanvasSceneNode(target?:string){const context=useContext(CanvasSceneContext);return context&&context.styleTarget===target?context:null;}
export function canvasNodeAttributes(node:CanvasSceneNodeContext|null){return node&&!node.outerFrame?{'data-owner-layout-id':node.id,'data-owner-layout-scope':node.scope}:{};}

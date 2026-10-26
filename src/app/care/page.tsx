import { permanentRedirect } from "next/navigation";
import { getPublishedSite } from "@/server/published-site";
import { PublishedRoute } from "@/server/PublishedRoute";
/** The bundled site's legacy alias is not an alias for a renamed/hidden publication. */
export default async function CareRedirect(){
  const state=await getPublishedSite();
  if(state.status==='baseline')permanentRedirect('/suitcare');
  return <PublishedRoute slug={['care']} />;
}

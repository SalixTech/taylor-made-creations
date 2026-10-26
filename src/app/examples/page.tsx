import { PublishedRoute } from "@/server/PublishedRoute";
import Link from "next/link";
import { Intro } from "@/components/Pages";
import { Photo } from "@/components/Photo";
export const metadata = { title: "Fursuit examples" };
function Examples(){return <div className="page-shell"><Intro eyebrow="PICTURE THE POSSIBILITIES" title="Fursuit examples"><p>Category examples from Taylor’s existing website. Your character’s design and included pieces are confirmed in your individual quote.</p></Intro>{[["heads","Heads"],["partials","Partials"],["fullsuits","Fullsuits"]].map(([id,title])=><section className="example-section" id={id} key={id}><h2>{title}</h2><Photo src={`/images/${id}.webp`} alt={`${title} examples from Taylor Made Creations’ existing website`}/><Link className="text-link example-link" href="/prices">Back to starting prices →</Link></section>)}<Link className="button" href="/gallery">Explore the Fursuit Gallery →</Link></div>}

export default function Page() { return <PublishedRoute slug={["examples"]} fallback={<Examples />} />; }

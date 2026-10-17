import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '../../../db/generated/client/index.js';
import {fixtures} from './fixtures.mjs';
const url=new URL(process.env.DATABASE_URL??'');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/incept_sync_phase2')throw Error('ISOLATED_DATABASE_REQUIRED');
const f=await fixtures(),db=new PrismaClient({log:[]}),dir='/tmp/phase2e-data';
const bodyJson={sections:[{id:'fixture-section',title:'Synthetic section',blocks:[{id:'fixture',type:'paragraph',text:'Synthetic full-site acceptance content.'}]}]},mediaName='a'.repeat(64)+'.wav';
if(process.argv[2]==='repair-preflight'){
  await db.docsDocumentLocale.updateMany({where:{slug:{in:['phase2e-guest','phase2e-private']}},data:{bodyJson}});
  const track=await db.musicTrack.findUniqueOrThrow({where:{trackKey:'phase2e-silence'}});
  await db.musicLibrary.upsert({where:{key:'phase2e'},create:{key:'phase2e',title:'Synthetic library',position:0,items:{create:{trackId:track.id}}},update:{}});
  await db.musicTrack.update({where:{id:track.id},data:{audioUrl:'/_music-media/'+mediaName}});
  await db.$disconnect();console.log(JSON.stringify({fixtureRepaired:true}));process.exit(0);
}
mkdirSync(dir+'/dashboard',{recursive:true});
f.writePhase0Home(dir+'/export-home',3);f.writePhase0Pricing(dir+'/dashboard');
f.phase0Import(f.phase0Export(dir+'/export-home'),dir+'/dashboard/imports.db');
for(const name of ['docs-media','docs-drafts','music-media','phase2e-metrics'])mkdirSync(dir+'/'+name,{recursive:true});
const password=randomBytes(24).toString('base64url'),secret=f.createTotpSecret();
await db.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase2e-owner',passwordHash:await f.hashPassword(password),totpCiphertext:f.encryptTotp(secret)},
  update:{username:'phase2e-owner',passwordHash:await f.hashPassword(password),totpCiphertext:f.encryptTotp(secret),totpLastStep:-1}});
const owner=await db.ownerAccount.findUniqueOrThrow({where:{id:'owner'}});
// Existing integration tests may leave revoked sessions/devices; keep audit and use a fresh login below.
await db.accessSession.updateMany({where:{role:'owner'},data:{revokedAt:new Date()}});
for(const accessRole of ['guest','private'])await db.docsDocument.create({data:{documentKey:'phase2e-'+accessRole,kind:'article',accessRole,
  locales:{create:['en','zh'].map(locale=>({locale,slug:'phase2e-'+accessRole,title:'Synthetic '+accessRole+' document',status:'published',publishedAt:new Date(),bodyJson}))}}});
const wav=Buffer.alloc(44+1600);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
writeFileSync(dir+'/music-media/'+mediaName,wav);
const track=await db.musicTrack.create({data:{trackKey:'phase2e-silence',title:'Synthetic silence',audioUrl:'/_music-media/'+mediaName,mimeType:'audio/wav',fileSize:wav.length,durationSeconds:1,position:0}});
await db.musicLibrary.create({data:{key:'phase2e',title:'Synthetic library',position:0,items:{create:{trackId:track.id}}}});
writeFileSync('/test/private-fixture.json',JSON.stringify({username:owner.username,password,secret}));
await db.$disconnect();
console.log(JSON.stringify({seeded:true,v1FixtureRecords:21,syntheticDocs:2,syntheticTrack:true}));

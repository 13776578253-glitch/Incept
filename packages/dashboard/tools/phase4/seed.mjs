// Explicit isolated fixture setup, never run against a production database.
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PrismaClient} from '../../../db/generated/client/index.js';
import {fixtures} from '../phase2e/fixtures.mjs';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.INCEPT_PHASE4_FIXTURE!=='1'||url.pathname!=='/incept_sync_phase4'||!['postgres','127.0.0.1'].includes(url.hostname))throw Error('ISOLATED_FIXTURE_REQUIRED');
let input='';for await(const b of process.stdin){input+=b.toString();if(input.length>4096)throw Error('FIXTURE_INPUT_LIMIT');}const {cookie}=JSON.parse(input);if(typeof cookie!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(cookie))throw Error('INVALID_FIXTURE_COOKIE');
const f=await fixtures(),db=new PrismaClient({log:[]}),secret=f.createTotpSecret();
const owner=await db.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase4-owner',passwordHash:await f.hashPassword(randomBytes(32).toString('hex')),totpCiphertext:f.encryptTotp(secret)},update:{totpCiphertext:f.encryptTotp(secret)}});
await db.accessSession.create({data:{ownerAccountId:'owner',role:'owner',credentialVersion:owner.credentialVersion,tokenHash:createHash('sha256').update(cookie).digest('hex'),authenticatedAt:new Date(),expiresAt:new Date(Date.now()+3600000)}});
mkdirSync('/data/home',{recursive:true});writeFileSync('/data/overrides.json','{}');await db.$disconnect();console.log(JSON.stringify({syntheticOwnerSession:true,homeInitialized:true}));

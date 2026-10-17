import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {PrismaClient} from '../../../db/generated/client/index.js';
import {hashPassword,createTotpSecret,encryptTotp} from '../../../db/src/owner/security';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.INCEPT_PHASE5_FIXTURE!=='1'||url.pathname!=='/incept_sync_phase4'||url.hostname!=='postgres')throw Error('ISOLATED_FIXTURE_REQUIRED');
let input='';for await(const chunk of process.stdin){input+=chunk.toString();if(input.length>4096)throw Error('FIXTURE_LIMIT');}
const {cookie,revokeHash}=JSON.parse(input);if(typeof cookie!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(cookie))throw Error('INVALID_COOKIE');
const db=new PrismaClient({log:[]}),owner=await db.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase5-owner',passwordHash:await hashPassword(randomBytes(32).toString('hex')),totpCiphertext:encryptTotp(createTotpSecret())},update:{}});
if(revokeHash){if(!/^[a-f\d]{64}$/.test(revokeHash))throw Error('INVALID_HASH');await db.accessSession.updateMany({where:{tokenHash:revokeHash},data:{revokedAt:new Date()}});}
await db.accessSession.create({data:{ownerAccountId:'owner',role:'owner',credentialVersion:owner.credentialVersion,tokenHash:createHash('sha256').update(cookie).digest('hex'),authenticatedAt:new Date(),expiresAt:new Date(Date.now()+3600000)}});
mkdirSync('/data/dashboard',{recursive:true});await db.$disconnect();console.log('{"syntheticOwnerSession":true}');

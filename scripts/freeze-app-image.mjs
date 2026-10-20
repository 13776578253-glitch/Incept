import {openSync,readSync,closeSync,readFileSync,writeFileSync,statSync,createReadStream,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

const [archiveArg,image,sourceArg,logArg,metadataArg,reportArg]=process.argv.slice(2);
if(!reportArg)throw Error('USAGE: archive image source-evidence build-log build-metadata output-report');
const archive=resolve(archiveArg),source=resolve(sourceArg),log=resolve(logArg),metadata=resolve(metadataArg),report=resolve(reportArg);
if(existsSync(report))throw Error('FROZEN_OUTPUT_EXISTS');
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const blobs=new Map();let archiveIndex;
const fd=openSync(archive,'r');let pos=0;const header=Buffer.alloc(512);
try{while(readSync(fd,header,0,512,pos)===512){
  if(header.every(x=>x===0))break;
  const str=(a,b)=>header.subarray(a,b).toString().split('\0')[0];
  const name=str(345,500)?str(345,500)+'/'+str(0,100):str(0,100),size=parseInt(str(124,136).trim(),8)||0;
  if((name==='index.json'||name.startsWith('blobs/sha256/'))&&size<262144&&size>0){
    const data=Buffer.alloc(size);if(readSync(fd,data,0,size,pos+512)!==size)throw Error('SHORT_ARCHIVE_READ');
    if(name==='index.json')archiveIndex=JSON.parse(data);
    else if(sha(data)!=='sha256:'+name.split('/').at(-1))throw Error('BLOB_HASH_MISMATCH');
    else{try{blobs.set(sha(data),{data,json:JSON.parse(data)});}catch{}}
  }
  pos+=512+Math.ceil(size/512)*512;
}}finally{closeSync(fd);}
if(!archiveIndex)throw Error('OCI_ARCHIVE_INDEX_MISSING');
const inspect=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
const top=inspect.Descriptor.digest,index=blobs.get(top)?.json;
if(!archiveIndex.manifests?.some(x=>x.digest===top))throw Error('ARCHIVE_TAG_INDEX_IDENTITY_MISMATCH');
if(!index?.manifests)throw Error('TOP_INDEX_MISSING');
const desc=index.manifests.find(x=>x.platform?.os==='linux'&&x.platform?.architecture==='amd64');
if(!desc)throw Error('AMD64_MANIFEST_MISSING');
const manifest=blobs.get(desc.digest)?.json,config=blobs.get(manifest?.config.digest)?.json;
if(!config||config.os!=='linux'||config.architecture!=='amd64')throw Error('CONFIG_PLATFORM_MISMATCH');
const platform=JSON.parse(execFileSync('docker',['image','inspect','--platform','linux/amd64',image],{encoding:'utf8'}))[0];
if(platform.Id!==manifest.config.digest&&platform.Id!==desc.digest)throw Error('UNEXPECTED_PLATFORM_INSPECT_ID');
if(JSON.stringify(platform.RootFS.Layers)!==JSON.stringify(config.rootfs.diff_ids))throw Error('ROOTFS_MISMATCH');
const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
const evidence={createdAt:new Date().toISOString(),status:'passed',image,platform:'linux/amd64',archive:{path:archive,bytes:statSync(archive).size,sha256:hash.digest('hex')},identity:{manifestListDigest:top,linuxPlatformManifestDigest:desc.digest,dockerImageConfigId:manifest.config.digest,defaultInspectId:inspect.Id,platformInspectId:platform.Id},checks:{identityBlobsHashVerified:true,archiveTagIndexMatch:true,rootfsDiffIdsMatch:true,configPlatformMatch:true},sourceEvidence:{path:source,sha256:sha(readFileSync(source)).slice(7)},buildLog:log,buildMetadata:metadata,artifactHashes:{buildLogSha256:sha(readFileSync(log)).slice(7),buildMetadataSha256:sha(readFileSync(metadata)).slice(7)},runtimeContainersStarted:false,existingContainersModified:false,remoteOperations:false};
writeFileSync(report,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence));

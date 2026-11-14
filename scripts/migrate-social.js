require("dotenv").config();
const fs=require("fs");
const path=require("path");
const {pool}=require("../src/db");
async function main(){
 const client=await pool.connect();
 try{
  await client.query("CREATE SCHEMA IF NOT EXISTS nexora_social_world");
  await client.query("CREATE TABLE IF NOT EXISTS nexora_social_world.schema_migrations(version VARCHAR(120) PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  const version="001_nexora_social_world";
  const applied=await client.query("SELECT 1 FROM nexora_social_world.schema_migrations WHERE version=$1",[version]);
  if(!applied.rowCount){
   const sql=fs.readFileSync(path.join(__dirname,"../database/migrations/001_nexora_social_world.sql"),"utf8");
   await client.query("BEGIN");
   try{await client.query(sql);await client.query("INSERT INTO nexora_social_world.schema_migrations(version) VALUES($1)",[version]);await client.query("COMMIT");console.log("Applied:",version);}
   catch(error){await client.query("ROLLBACK");throw error;}
  }else console.log("Already applied:",version);
 }finally{client.release();await pool.end();}
}
main().catch(error=>{console.error("NEXORA social migration failed:",error.message);process.exitCode=1;});

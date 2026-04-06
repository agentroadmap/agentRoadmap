# sdb (Postgres) ERD: Agent-Native Product Development Platform

This document maintains the canonical ERD for the **sdb** (Postgres) neural core. 
Tables follow the **RFC Lifecycle** for all product steps.

## Visual Diagram (PlantUML)

```puml
@startuml
skinparam handwritten false
skinparam monochrome true
skinparam packageStyle rect
skinparam defaultFontName "Verdana"

' --- CORE DOMAIN ---
entity goal {
  * id : string <<PK>>
  --
  title : string
  description : string
  status : string (aspirational|achieved)
}

entity step {
  * id : string <<PK>>
  --
  compId : string <<FK>>
  teamId : string <<FK>>
  goalId : string <<FK>>
  title : string
  status : string (draft|accepted|active|review|complete|rejected|parked|abandoned)
  body : string
  claimedBy : string <<FK>>
  claimedAt : u64
  createdAt : u64
  updatedAt : u64
}

entity comp {
  * id : string <<PK>>
  --
  name : string
  parentId : string <<FK>>
  description : string
}

entity adr {
  * id : string <<PK>>
  --
  stepId : string <<FK>>
  teamId : string <<FK>>
  title : string
  decision : string
  rationale : string
  createdAt : u64
}

' --- AGENT & TEAM ---
entity agent {
  * id : string <<PK>>
  --
  name : string
  role : string
  goal : string
  backstory : string
  connected : boolean
  lastSeen : u64
  focus : string <<FK>> (stepId)
}

entity team {
  * id : string <<PK>>
  --
  name : string
  mission : string
}

entity member {
  * teamId : string <<FK>>
  * agentId : string <<FK>>
  --
  role : string
  joinedAt : u64
}

' --- WORK & DISCUSSION ---
entity claim {
  * claimId : u64 <<PK>>
  --
  stepId : string <<FK>>
  agentId : string <<FK>>
  claimedAt : u64
  expiresAt : u64
  active : boolean
}

entity ac {
  * acId : u64 <<PK>>
  --
  stepId : string <<FK>>
  description : string
  verified : boolean
}

entity rev {
  * id : string <<PK>>
  --
  stepId : string <<FK>>
  reviewerId : string <<FK>>
  verdict : string (support|reject|guidance)
  rationale : string
  timestamp : u64
}

entity flow {
  * flowId : u64 <<PK>>
  --
  stepId : string <<FK>>
  fromStatus : string
  toStatus : string
  reason : string
  changedBy : string
  timestamp : u64
}

' --- MSG & QA ---
entity msg {
  * msgId : u64 <<PK>>
  --
  fromAgentId : string <<FK>>
  chanId : string <<FK>>
  text : string
  timestamp : u64
}

entity test {
  * testId : u64 <<PK>>
  --
  stepId : string <<FK>>
  name : string
  file : string
}

entity res {
  * resId : u64 <<PK>>
  --
  testId : u64 <<FK>>
  passed : boolean
  timestamp : u64
}

' --- RELATIONSHIPS ---
goal ||--o{ step
comp ||--o{ step
team ||--o{ step
step ||--o{ ac
step ||--o{ claim
step ||--o{ test
step ||--o{ rev : "discussed_in"
step ||--o{ adr
step ||--o{ flow

agent ||--o{ member
team ||--o{ member
agent ||--o{ rev
agent ||--o{ claim

test ||--o{ res

@enduml
```

## How to Request Changes
...
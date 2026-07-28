# Docs Authoring Five-Step Plan

## Summary

This plan defines a controlled five-step path for the docs authoring system.

The goal is:

- avoid jumping into `create` too early
- stabilize the block model first
- keep snapshot and AI workflows extensible
- make each phase independently testable

## Step 1. Define Initial Blocks

Goal:

- define the first usable docs block set
- build a small renderer test surface

Initial block scope:

- `heading`
- `paragraph`
- `list`
- `callout`
- `quote`
- `code`
- `divider`

Deliverables:

- block type list
- minimal block schema
- static preview/demo page
- renderer support for all initial blocks

Out of scope:

- create UI
- database schema
- AI editing

## Step 2. Define Block Composition Rules

Goal:

- define how blocks form a full document
- clarify section boundaries and composition rules

Focus:

- section vs block relationship
- heading hierarchy rules
- block ordering rules
- which block types can appear anywhere
- whether any block types can nest

Deliverables:

- document composition rules
- section boundary rules
- renderer behavior for invalid or edge-case combinations

Out of scope:

- full editor implementation
- snapshot system

## Step 3. Build Snapshot Foundations

Goal:

- add basic version snapshot capability for single-user editing

Focus:

- current draft structure
- published version structure
- snapshot structure
- restore flow

Deliverables:

- snapshot data model
- table structure plan
- save snapshot logic
- restore snapshot logic

Out of scope:

- multi-user collaboration
- advanced diff UI

## Step 4. Build Create UI And AI Assistance

Goal:

- create the first usable authoring interface on top of the stabilized block model

Focus:

- add/edit/delete/reorder blocks
- basic preview flow
- AI-assisted generation and rewriting

Initial AI scope:

- generate draft
- rewrite selected block
- expand a section
- convert raw text into blocks

Deliverables:

- create/editor page
- block editing workflow
- basic AI action entry points

Out of scope:

- Notion-level interaction polish
- full advanced media block system

## Step 5. Expand Rich Blocks

Goal:

- extend the block system after the base workflow is stable

Next candidate blocks:

- `image`
- `video`
- `audio`
- `embed`
- `gif`
- `interactive`
- `3d`

Deliverables:

- additional block schemas
- renderer support
- gradual create-side support

## Validation Principle

Each phase should be checked from three angles:

- data structure stability
- renderer stability
- future extensibility for AI and snapshots

## Current Recommendation

The next concrete implementation target should be Step 1:

- define block v1
- build a static docs block preview surface
- verify reading rhythm, hierarchy, and visual consistency before create begins

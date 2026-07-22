-- Drop the dormant learning-item catalog and observation tables.
--
-- Created in 0003_esl.sql for a reading-v2 vision that never shipped, they were never read
-- or written by any code. The shared learner model (0014) deliberately did not revive them:
-- they key on a vocabulary that competes with `passage_tags`, and are superseded by
-- `learner_tag_observations`. Design: docs/learner-model-design.md §4.1.
--
-- Dropped now, in a migration separate from 0014, so the schema change is not entangled with
-- the feature that replaced them. Nothing depends on these tables; they hold no data.

-- Observations first: it foreign-keys the catalog.
DROP TABLE IF EXISTS esl_item_observations;
DROP TABLE IF EXISTS esl_learning_items;

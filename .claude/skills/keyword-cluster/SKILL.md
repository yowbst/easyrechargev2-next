---
name: keyword-cluster
description: Cluster unclustered keywords from Keywords Master using semantic analysis
---

# Keyword Clustering

Group unclustered keywords into topic clusters.

## Usage

`/keyword-cluster`

## Instructions

1. Run `npm run seo -- keywords cluster`. It pre-groups unclustered terms by shared words and writes `seo/data/keywords-preclustered-<date>.json`.
2. Read that file and assign the keywords to semantic clusters:
   - consider search intent (informational, commercial, transactional);
   - group by topic, not only shared words;
   - name clusters in French ("Installation borne maison", "Prix recharge VE", "Subventions cantonales");
   - mark pillar topics (broad) and support topics (long-tail).
3. Write the assignments to a JSON file (`[{"term": "...", "cluster": "...", "intent": "informational"}]`) and apply it:
   `npm run seo -- sheet upsert keywordsMaster term seo/data/cluster-assignments.json --protect status,volume_estimate,cpc`
4. Write the cluster structure the same way (`[{"cluster_name": "...", "type": "pillar|support", "keyword_count": "10", "status": "no_content|has_content"}]`):
   `npm run seo -- sheet upsert topicClusters cluster_name seo/data/clusters.json`
5. Summarize each cluster for the user.

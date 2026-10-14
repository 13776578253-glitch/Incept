-- The About introduction is public; other documents retain their existing access rules.
UPDATE docs_documents
SET "accessRole" = 'guest'
WHERE "documentKey" = 'about' AND "isListed" = false;

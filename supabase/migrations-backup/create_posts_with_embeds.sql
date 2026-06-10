-- Create posts table with TipTap JSON content support
-- This migration creates a posts table that stores TipTap editor content as JSONB
-- The embed nodes are stored within the TipTap JSON structure

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- TipTap JSON content (includes embed nodes)
  image TEXT, -- Thumbnail image URL (optional)
  author_id UUID, -- Reference to users table (if you have one)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on community_slug for faster queries
CREATE INDEX IF NOT EXISTS idx_posts_community_slug ON posts(community_slug);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Create GIN index on content JSONB for full-text search (optional)
CREATE INDEX IF NOT EXISTS idx_posts_content_gin ON posts USING GIN(content);

-- Optional: Create a separate embeds table for analytics/tracking
-- This is useful if you want to query embeds separately or track embed usage
CREATE TABLE IF NOT EXISTS embeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'instagram', 'x')),
  url TEXT NOT NULL,
  title TEXT,
  thumbnail_url TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on post_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_embeds_post_id ON embeds(post_id);

-- Create index on provider for analytics
CREATE INDEX IF NOT EXISTS idx_embeds_provider ON embeds(provider);

-- Function to extract embeds from TipTap JSON and insert into embeds table
-- This is optional but useful for maintaining a separate embeds table
CREATE OR REPLACE FUNCTION extract_embeds_from_post()
RETURNS TRIGGER AS $$
DECLARE
  embed_node JSONB;
BEGIN
  -- Clear existing embeds for this post
  DELETE FROM embeds WHERE post_id = NEW.id;
  
  -- Extract embed nodes from TipTap JSON content
  -- TipTap JSON structure: { type: "doc", content: [...] }
  -- Embed nodes: { type: "embed", attrs: { provider, url, html, ... } }
  FOR embed_node IN
    SELECT jsonb_array_elements(
      jsonb_path_query_array(
        NEW.content,
        '$.content[*] ? (@.type == "embed")'
      )
    )
  LOOP
    INSERT INTO embeds (
      post_id,
      provider,
      url,
      title,
      thumbnail_url,
      author_name
    ) VALUES (
      NEW.id,
      embed_node->'attrs'->>'provider',
      embed_node->'attrs'->>'url',
      embed_node->'attrs'->>'title',
      embed_node->'attrs'->>'thumbnail_url',
      embed_node->'attrs'->>'author_name'
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically extract embeds when a post is created or updated
CREATE TRIGGER extract_embeds_trigger
  AFTER INSERT OR UPDATE OF content ON posts
  FOR EACH ROW
  EXECUTE FUNCTION extract_embeds_from_post();

-- Example query to get posts with their embeds:
-- SELECT 
--   p.*,
--   jsonb_agg(e.*) FILTER (WHERE e.id IS NOT NULL) as embeds
-- FROM posts p
-- LEFT JOIN embeds e ON p.id = e.post_id
-- GROUP BY p.id;


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      lfa_fixtures: {
        Row: {
          id: string
          lfa_match_id: string
          fixture: Json
          match_time: string
          betman_game_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lfa_match_id: string
          fixture: Json
          match_time: string
          betman_game_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lfa_match_id?: string
          fixture?: Json
          match_time?: string
          betman_game_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      adj_titles: {
        Row: {
          board_slug: string | null
          created_at: string | null
          description: string | null
          id: string
          rarity: string
          slug: string
          title: string
        }
        Insert: {
          board_slug?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          rarity?: string
          slug: string
          title: string
        }
        Update: {
          board_slug?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          rarity?: string
          slug?: string
          title?: string
        }
        Relationships: []
      }
      admin_activity_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_activity_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      admin_insights: {
        Row: {
          created_at: string
          generated_by: string
          generation_duration_ms: number | null
          id: string
          input_snapshot: Json
          insight: Json
          model: string
          period_end: string
          period_start: string
        }
        Insert: {
          created_at?: string
          generated_by?: string
          generation_duration_ms?: number | null
          id?: string
          input_snapshot: Json
          insight: Json
          model: string
          period_end: string
          period_start: string
        }
        Update: {
          created_at?: string
          generated_by?: string
          generation_duration_ms?: number | null
          id?: string
          input_snapshot?: Json
          insight?: Json
          model?: string
          period_end?: string
          period_start?: string
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          action_type: string
          content_preview: string | null
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          parent_id: string | null
          persona_id: string
          run_id: string
          success: boolean
          target_id: string | null
        }
        Insert: {
          action_type: string
          content_preview?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          parent_id?: string | null
          persona_id: string
          run_id: string
          success?: boolean
          target_id?: string | null
        }
        Update: {
          action_type?: string
          content_preview?: string | null
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          parent_id?: string | null
          persona_id?: string
          run_id?: string
          success?: boolean
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      agent_personas: {
        Row: {
          clerk_user_id: string | null
          config: Json
          created_at: string
          id: string
          nickname: string
          persona_id: string
          role_type: string
        }
        Insert: {
          clerk_user_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          nickname: string
          persona_id: string
          role_type: string
        }
        Update: {
          clerk_user_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          nickname?: string
          persona_id?: string
          role_type?: string
        }
        Relationships: []
      }
      agent_picks: {
        Row: {
          kind: string
          payload: Json
          updated_at: string
        }
        Insert: {
          kind: string
          payload: Json
          updated_at?: string
        }
        Update: {
          kind?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          id: string
          run_id: string
          started_at: string | null
          status: string
          summary: Json | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          id?: string
          run_id: string
          started_at?: string | null
          status?: string
          summary?: Json | null
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          id?: string
          run_id?: string
          started_at?: string | null
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      agg_reservoir: {
        Row: {
          audit: Json
          body_excerpt: string | null
          category: string | null
          created_at: string
          id: string
          media: Json
          post_id: string | null
          published_at: string | null
          reject_reason: string | null
          rewritten: Json | null
          scheduled_at: string | null
          source: string
          source_title: string
          source_url: string
          status: string
        }
        Insert: {
          audit?: Json
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          id?: string
          media?: Json
          post_id?: string | null
          published_at?: string | null
          reject_reason?: string | null
          rewritten?: Json | null
          scheduled_at?: string | null
          source: string
          source_title: string
          source_url: string
          status?: string
        }
        Update: {
          audit?: Json
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          id?: string
          media?: Json
          post_id?: string | null
          published_at?: string | null
          reject_reason?: string | null
          rewritten?: Json | null
          scheduled_at?: string | null
          source?: string
          source_title?: string
          source_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agg_reservoir_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agg_reservoir_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      agg_training_entries: {
        Row: {
          ai_body: string
          ai_title: string
          angle: string | null
          body_excerpt: string | null
          category: string | null
          created_at: string
          fix_body: string | null
          fix_title: string | null
          id: string
          learned_at: string | null
          media: Json
          persona: string
          reject_reason: string | null
          reviewed_at: string | null
          round: number
          source_title: string
          status: string
          structure: string
        }
        Insert: {
          ai_body: string
          ai_title: string
          angle?: string | null
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          fix_body?: string | null
          fix_title?: string | null
          id?: string
          learned_at?: string | null
          media?: Json
          persona: string
          reject_reason?: string | null
          reviewed_at?: string | null
          round: number
          source_title: string
          status?: string
          structure: string
        }
        Update: {
          ai_body?: string
          ai_title?: string
          angle?: string | null
          body_excerpt?: string | null
          category?: string | null
          created_at?: string
          fix_body?: string | null
          fix_title?: string | null
          id?: string
          learned_at?: string | null
          media?: Json
          persona?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          round?: number
          source_title?: string
          status?: string
          structure?: string
        }
        Relationships: []
      }
      announcement_banners: {
        Row: {
          created_at: string | null
          description: string | null
          gradient: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gradient?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gradient?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_pinned: boolean | null
          published_at: string | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          published_at?: string | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_pinned?: boolean | null
          published_at?: string | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      banners: {
        Row: {
          click_count: number | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          position: string
          sort_order: number | null
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          click_count?: number | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          click_count?: number | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      battle_comments: {
        Row: {
          battle_id: string
          content: string
          created_at: string
          id: string
          nickname: string
          side_id: string
          user_id: string
        }
        Insert: {
          battle_id: string
          content: string
          created_at?: string
          id?: string
          nickname: string
          side_id: string
          user_id: string
        }
        Update: {
          battle_id?: string
          content?: string
          created_at?: string
          id?: string
          nickname?: string
          side_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_comments_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_comments_side_id_fkey"
            columns: ["side_id"]
            isOneToOne: false
            referencedRelation: "battle_sides"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_participants: {
        Row: {
          battle_id: string
          created_at: string
          id: string
          side_id: string
          user_id: string
        }
        Insert: {
          battle_id: string
          created_at?: string
          id?: string
          side_id: string
          user_id: string
        }
        Update: {
          battle_id?: string
          created_at?: string
          id?: string
          side_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "battle_participants_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battle_participants_side_id_fkey"
            columns: ["side_id"]
            isOneToOne: false
            referencedRelation: "battle_sides"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_rooms: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bracket_size: number | null
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          metadata: Json | null
          mode: string
          starts_at: string | null
          status: string
          thumbnail_url: string | null
          title: string
          total_participants: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_size?: number | null
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json | null
          mode: string
          starts_at?: string | null
          status?: string
          thumbnail_url?: string | null
          title: string
          total_participants?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_size?: number | null
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          metadata?: Json | null
          mode?: string
          starts_at?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          total_participants?: number
          updated_at?: string
        }
        Relationships: []
      }
      battle_sides: {
        Row: {
          battle_id: string
          color: string
          created_at: string
          id: string
          image_url: string | null
          name: string
          score: number
          sort_order: number
        }
        Insert: {
          battle_id: string
          color?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          score?: number
          sort_order?: number
        }
        Update: {
          battle_id?: string
          color?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          score?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_sides_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      betman_daily_rounds: {
        Row: {
          bet_close_at: string
          bet_open_at: string
          created_at: string | null
          daily_id: string
          game_count: number | null
          id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          bet_close_at: string
          bet_open_at: string
          created_at?: string | null
          daily_id: string
          game_count?: number | null
          id?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          bet_close_at?: string
          bet_open_at?: string
          created_at?: string | null
          daily_id?: string
          game_count?: number | null
          id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      betman_games: {
        Row: {
          away_score: number | null
          away_team_name: string
          away_win_odds: number | null
          created_at: string | null
          daily_round_id: string | null
          draw_odds: number | null
          even_odds: number | null
          game_no: number
          game_type: string
          handicap: number | null
          home_score: number | null
          home_team_name: string
          home_win_odds: number | null
          id: string
          league_code: string
          mapped_away_team_id: string | null
          mapped_home_team_id: string | null
          mapped_league_id: string | null
          mapped_match_id: string | null
          match_time: string
          odd_odds: number | null
          over_odds: number | null
          over_under_line: number | null
          result: string | null
          round_id: string
          sport: string
          status: string
          under_odds: number | null
          updated_at: string | null
          wisetoto_at: string | null
          wisetoto_away_score: number | null
          wisetoto_home_score: number | null
          venue: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_name: string
          away_win_odds?: number | null
          created_at?: string | null
          daily_round_id?: string | null
          draw_odds?: number | null
          even_odds?: number | null
          game_no: number
          game_type: string
          handicap?: number | null
          home_score?: number | null
          home_team_name: string
          home_win_odds?: number | null
          id?: string
          league_code: string
          mapped_away_team_id?: string | null
          mapped_home_team_id?: string | null
          mapped_league_id?: string | null
          mapped_match_id?: string | null
          match_time: string
          odd_odds?: number | null
          over_odds?: number | null
          over_under_line?: number | null
          result?: string | null
          round_id: string
          sport: string
          status?: string
          under_odds?: number | null
          updated_at?: string | null
          wisetoto_at?: string | null
          wisetoto_away_score?: number | null
          wisetoto_home_score?: number | null
          venue?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_name?: string
          away_win_odds?: number | null
          created_at?: string | null
          daily_round_id?: string | null
          draw_odds?: number | null
          even_odds?: number | null
          game_no?: number
          game_type?: string
          handicap?: number | null
          home_score?: number | null
          home_team_name?: string
          home_win_odds?: number | null
          id?: string
          league_code?: string
          mapped_away_team_id?: string | null
          mapped_home_team_id?: string | null
          mapped_league_id?: string | null
          mapped_match_id?: string | null
          match_time?: string
          odd_odds?: number | null
          over_odds?: number | null
          over_under_line?: number | null
          result?: string | null
          round_id?: string
          sport?: string
          status?: string
          under_odds?: number | null
          updated_at?: string | null
          wisetoto_at?: string | null
          wisetoto_away_score?: number | null
          wisetoto_home_score?: number | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "betman_games_daily_round_id_fkey"
            columns: ["daily_round_id"]
            isOneToOne: false
            referencedRelation: "betman_daily_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_games_mapped_away_team_id_fkey"
            columns: ["mapped_away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_games_mapped_home_team_id_fkey"
            columns: ["mapped_home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_games_mapped_league_id_fkey"
            columns: ["mapped_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_games_mapped_match_id_fkey"
            columns: ["mapped_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_games_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "betman_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      betman_predictions: {
        Row: {
          created_at: string | null
          daily_round_id: string | null
          game_id: string
          id: string
          is_correct: boolean | null
          locked_handicap: number | null
          locked_line: number | null
          locked_odds: number | null
          points_earned: number | null
          prediction: string
          round_id: string | null
          settled_at: string | null
          slip_id: string | null
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_round_id?: string | null
          game_id: string
          id?: string
          is_correct?: boolean | null
          locked_handicap?: number | null
          locked_line?: number | null
          locked_odds?: number | null
          points_earned?: number | null
          prediction: string
          round_id?: string | null
          settled_at?: string | null
          slip_id?: string | null
          stake?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_round_id?: string | null
          game_id?: string
          id?: string
          is_correct?: boolean | null
          locked_handicap?: number | null
          locked_line?: number | null
          locked_odds?: number | null
          points_earned?: number | null
          prediction?: string
          round_id?: string | null
          settled_at?: string | null
          slip_id?: string | null
          stake?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "betman_predictions_daily_round_id_fkey"
            columns: ["daily_round_id"]
            isOneToOne: false
            referencedRelation: "betman_daily_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_predictions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "betman_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betman_predictions_slip_id_fkey"
            columns: ["slip_id"]
            isOneToOne: false
            referencedRelation: "prediction_slips"
            referencedColumns: ["id"]
          },
        ]
      }
      betman_rounds: {
        Row: {
          created_at: string | null
          deadline: string | null
          gm_ts: string | null
          id: string
          round: number
          status: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          deadline?: string | null
          gm_ts?: string | null
          id?: string
          round: number
          status?: string
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          deadline?: string | null
          gm_ts?: string | null
          id?: string
          round?: number
          status?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      betman_result_checks: {
        Row: {
          alerted_at: string | null
          betman_score: string | null
          checked_at: string
          game_id: string
          lfa_score: string | null
          note: string | null
          verdict: string
          wisetoto_score: string | null
        }
        Insert: {
          alerted_at?: string | null
          betman_score?: string | null
          checked_at?: string
          game_id: string
          lfa_score?: string | null
          note?: string | null
          verdict: string
          wisetoto_score?: string | null
        }
        Update: {
          alerted_at?: string | null
          betman_score?: string | null
          checked_at?: string
          game_id?: string
          lfa_score?: string | null
          note?: string | null
          verdict?: string
          wisetoto_score?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "betman_result_checks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
        ]
      }
      betman_sync_state: {
        Row: {
          active_rounds: string[]
          created_at: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          last_score_sync_at: string | null
          last_sync_action: string | null
          last_sync_games_count: number | null
          latest_gm_ts: string
          updated_at: string | null
        }
        Insert: {
          active_rounds?: string[]
          created_at?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_score_sync_at?: string | null
          last_sync_action?: string | null
          last_sync_games_count?: number | null
          latest_gm_ts?: string
          updated_at?: string | null
        }
        Update: {
          active_rounds?: string[]
          created_at?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          last_score_sync_at?: string | null
          last_sync_action?: string | null
          last_sync_games_count?: number | null
          latest_gm_ts?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      betman_unknown_games: {
        Row: {
          away_score: number | null
          away_team_name: string | null
          bet_typ_id: string
          first_seen_at: string
          game_no: number
          game_result: string | null
          gm_ts: string
          handi_val: number
          home_score: number | null
          home_team_name: string | null
          id: string
          last_seen_at: string
          league_code: string | null
          match_time: string | null
          mch_score: string | null
          raw_data: Json
          source: string
          sport: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_name?: string | null
          bet_typ_id?: string
          first_seen_at?: string
          game_no?: number
          game_result?: string | null
          gm_ts: string
          handi_val?: number
          home_score?: number | null
          home_team_name?: string | null
          id?: string
          last_seen_at?: string
          league_code?: string | null
          match_time?: string | null
          mch_score?: string | null
          raw_data: Json
          source: string
          sport?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_name?: string | null
          bet_typ_id?: string
          first_seen_at?: string
          game_no?: number
          game_result?: string | null
          gm_ts?: string
          handi_val?: number
          home_score?: number | null
          home_team_name?: string | null
          id?: string
          last_seen_at?: string
          league_code?: string | null
          match_time?: string | null
          mch_score?: string | null
          raw_data?: Json
          source?: string
          sport?: string | null
        }
        Relationships: []
      }
      betman_user_sport_stats: {
        Row: {
          accuracy: number | null
          best_win_streak: number | null
          cancelled_predictions: number | null
          correct_predictions: number | null
          created_at: string | null
          current_streak: number | null
          id: string
          net_profit: number | null
          profit_rate: number | null
          sport: string
          total_predictions: number | null
          total_returns: number | null
          total_wagered: number | null
          updated_at: string | null
          user_id: string
          worst_lose_streak: number | null
          wrong_predictions: number | null
        }
        Insert: {
          accuracy?: number | null
          best_win_streak?: number | null
          cancelled_predictions?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          net_profit?: number | null
          profit_rate?: number | null
          sport: string
          total_predictions?: number | null
          total_returns?: number | null
          total_wagered?: number | null
          updated_at?: string | null
          user_id: string
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Update: {
          accuracy?: number | null
          best_win_streak?: number | null
          cancelled_predictions?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          id?: string
          net_profit?: number | null
          profit_rate?: number | null
          sport?: string
          total_predictions?: number | null
          total_returns?: number | null
          total_wagered?: number | null
          updated_at?: string | null
          user_id?: string
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Relationships: []
      }
      board_moderators: {
        Row: {
          community_slug: string
          granted_at: string
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          community_slug: string
          granted_at?: string
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          community_slug?: string
          granted_at?: string
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          parent_slug: string | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_slug?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      comment_cooldowns: {
        Row: {
          created_at: string | null
          id: string
          last_comment_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_comment_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_comment_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          depth: number | null
          id: string
          is_secret: boolean
          parent_id: string | null
          path: string[] | null
          post_id: string
          sticker_id: string | null
          updated_at: string | null
          user_id: string
          vote_count: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_at?: string | null
          depth?: number | null
          id?: string
          is_secret?: boolean
          parent_id?: string | null
          path?: string[] | null
          post_id: string
          sticker_id?: string | null
          updated_at?: string | null
          user_id: string
          vote_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          depth?: number | null
          id?: string
          is_secret?: boolean
          parent_id?: string | null
          path?: string[] | null
          post_id?: string
          sticker_id?: string | null
          updated_at?: string | null
          user_id?: string
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_messages: {
        Row: {
          attachments: string[] | null
          content: string
          created_at: string | null
          id: string
          is_read: boolean
          message_type: string
          order_id: string
          sender_id: string
        }
        Insert: {
          attachments?: string[] | null
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean
          message_type?: string
          order_id: string
          sender_id: string
        }
        Update: {
          attachments?: string[] | null
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean
          message_type?: string
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commission_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_milestones: {
        Row: {
          approved_at: string | null
          created_at: string | null
          deliverable_images: string[] | null
          deliverable_note: string | null
          description: string | null
          feedback: string | null
          id: string
          milestone_number: number
          order_id: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string | null
          deliverable_images?: string[] | null
          deliverable_note?: string | null
          description?: string | null
          feedback?: string | null
          id?: string
          milestone_number: number
          order_id: string
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string | null
          deliverable_images?: string[] | null
          deliverable_note?: string | null
          description?: string | null
          feedback?: string | null
          id?: string
          milestone_number?: number
          order_id?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_milestones_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commission_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_orders: {
        Row: {
          accepted_at: string | null
          artist_id: string
          auto_release_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          deadline_at: string | null
          delivery_days: number
          description: string
          escrow_held: boolean
          escrow_refunded_at: string | null
          escrow_released_at: string | null
          id: string
          max_revisions: number
          order_number: string
          package_id: string
          platform_fee_gold: number
          price_gold: number
          reference_images: string[] | null
          revisions_used: number
          started_at: string | null
          status: string
          submitted_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          artist_id: string
          auto_release_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          deadline_at?: string | null
          delivery_days: number
          description?: string
          escrow_held?: boolean
          escrow_refunded_at?: string | null
          escrow_released_at?: string | null
          id?: string
          max_revisions?: number
          order_number: string
          package_id: string
          platform_fee_gold?: number
          price_gold: number
          reference_images?: string[] | null
          revisions_used?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          artist_id?: string
          auto_release_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          deadline_at?: string | null
          delivery_days?: number
          description?: string
          escrow_held?: boolean
          escrow_refunded_at?: string | null
          escrow_released_at?: string | null
          id?: string
          max_revisions?: number
          order_number?: string
          package_id?: string
          platform_fee_gold?: number
          price_gold?: number
          reference_images?: string[] | null
          revisions_used?: number
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "commission_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_packages: {
        Row: {
          artist_id: string
          created_at: string | null
          delivery_days: number
          description: string
          example_images: string[]
          features: string[]
          id: string
          is_active: boolean
          max_revisions: number
          max_slots: number
          name: string
          price_gold: number
          sort_order: number
          type: string
          updated_at: string | null
          used_slots: number
        }
        Insert: {
          artist_id: string
          created_at?: string | null
          delivery_days: number
          description?: string
          example_images?: string[]
          features?: string[]
          id?: string
          is_active?: boolean
          max_revisions?: number
          max_slots?: number
          name: string
          price_gold: number
          sort_order?: number
          type: string
          updated_at?: string | null
          used_slots?: number
        }
        Update: {
          artist_id?: string
          created_at?: string | null
          delivery_days?: number
          description?: string
          example_images?: string[]
          features?: string[]
          id?: string
          is_active?: boolean
          max_revisions?: number
          max_slots?: number
          name?: string
          price_gold?: number
          sort_order?: number
          type?: string
          updated_at?: string | null
          used_slots?: number
        }
        Relationships: []
      }
      community_follows: {
        Row: {
          community_slug: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          community_slug: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          community_slug?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      content_flags: {
        Row: {
          created_at: string
          generator: string
          id: string
          is_test_data: boolean
          run_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          generator?: string
          id?: string
          is_test_data?: boolean
          run_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          generator?: string
          id?: string
          is_test_data?: boolean
          run_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_flags_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      content_reports: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string | null
          id: string
          reason: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      crawler_run_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          finished_at: string | null
          id: number
          items_fetched: number | null
          items_saved: number | null
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: never
          items_fetched?: number | null
          items_saved?: number | null
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: never
          items_fetched?: number | null
          items_saved?: number | null
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      creator_videos: {
        Row: {
          creator_id: string
          id: string
          published_at: string
          synced_at: string
          thumbnail_url: string
          title: string
          youtube_video_id: string
        }
        Insert: {
          creator_id: string
          id?: string
          published_at: string
          synced_at?: string
          thumbnail_url: string
          title: string
          youtube_video_id: string
        }
        Update: {
          creator_id?: string
          id?: string
          published_at?: string
          synced_at?: string
          thumbnail_url?: string
          title?: string
          youtube_video_id?: string
        }
        Relationships: []
      }
      cron_run_log: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          http_status: number | null
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          job_name: string
          started_at?: string
          status: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      daily_point_caps: {
        Row: {
          board_slug: string
          date: string
          earned_today: number
          id: string
          user_id: string
        }
        Insert: {
          board_slug: string
          date?: string
          earned_today?: number
          id?: string
          user_id: string
        }
        Update: {
          board_slug?: string
          date?: string
          earned_today?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string | null
          deleted_by_receiver: boolean | null
          deleted_by_sender: boolean | null
          id: string
          is_read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deleted_by_receiver?: boolean | null
          deleted_by_sender?: boolean | null
          id?: string
          is_read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deleted_by_receiver?: boolean | null
          deleted_by_sender?: boolean | null
          id?: string
          is_read?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_id: string | null
          commission_id: string
          created_at: string | null
          description: string
          evidence_urls: string[] | null
          id: string
          raised_by: string
          reason: string
          refund_amount: number | null
          resolution: string | null
          resolved_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          admin_id?: string | null
          commission_id: string
          created_at?: string | null
          description: string
          evidence_urls?: string[] | null
          id?: string
          raised_by: string
          reason: string
          refund_amount?: number | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          admin_id?: string | null
          commission_id?: string
          created_at?: string | null
          description?: string
          evidence_urls?: string[] | null
          id?: string
          raised_by?: string
          reason?: string
          refund_amount?: number | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      draft_game_picks: {
        Row: {
          created_at: string
          draft_id: string
          game_slug: string
          id: number
          pick_no: number
          picked_by: string
          player_id: string
          round: number
        }
        Insert: {
          created_at?: string
          draft_id: string
          game_slug: string
          id?: never
          pick_no: number
          picked_by: string
          player_id: string
          round: number
        }
        Update: {
          created_at?: string
          draft_id?: string
          game_slug?: string
          id?: never
          pick_no?: number
          picked_by?: string
          player_id?: string
          round?: number
        }
        Relationships: []
      }
      draft_room_messages: {
        Row: {
          body: string | null
          created_at: string
          display_name: string
          id: string
          kind: string
          payload: Json | null
          room_id: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          display_name: string
          id?: string
          kind?: string
          payload?: Json | null
          room_id: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          display_name?: string
          id?: string
          kind?: string
          payload?: Json | null
          room_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_room_picks: {
        Row: {
          id: string
          is_auto_pick: boolean
          pick_number: number
          picked_at: string
          player_id: string
          room_id: string
          seat_index: number
        }
        Insert: {
          id?: string
          is_auto_pick?: boolean
          pick_number: number
          picked_at?: string
          player_id: string
          room_id: string
          seat_index: number
        }
        Update: {
          id?: string
          is_auto_pick?: boolean
          pick_number?: number
          picked_at?: string
          player_id?: string
          room_id?: string
          seat_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_room_picks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_room_seats: {
        Row: {
          ai_name: string | null
          disconnected_at: string | null
          display_name: string
          id: string
          is_ai: boolean
          is_host: boolean
          is_ready: boolean
          joined_at: string
          left_at: string | null
          room_id: string
          seat_index: number
          user_id: string | null
        }
        Insert: {
          ai_name?: string | null
          disconnected_at?: string | null
          display_name: string
          id?: string
          is_ai?: boolean
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          left_at?: string | null
          room_id: string
          seat_index: number
          user_id?: string | null
        }
        Update: {
          ai_name?: string | null
          disconnected_at?: string | null
          display_name?: string
          id?: string
          is_ai?: boolean
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          left_at?: string | null
          room_id?: string
          seat_index?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_room_seats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "draft_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_rooms: {
        Row: {
          budget: number
          completed_at: string | null
          created_at: string
          current_pick: number
          drafting_started_at: string | null
          formation: string | null
          game_slug: string
          host_user_id: string
          id: string
          invite_code: string
          is_private: boolean
          last_activity_at: string
          max_participants: number
          pick_deadline_at: string | null
          snake_order: number[] | null
          status: string
          total_rounds: number
        }
        Insert: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          current_pick?: number
          drafting_started_at?: string | null
          formation?: string | null
          game_slug?: string
          host_user_id: string
          id?: string
          invite_code: string
          is_private?: boolean
          last_activity_at?: string
          max_participants?: number
          pick_deadline_at?: string | null
          snake_order?: number[] | null
          status?: string
          total_rounds?: number
        }
        Update: {
          budget?: number
          completed_at?: string | null
          created_at?: string
          current_pick?: number
          drafting_started_at?: string | null
          formation?: string | null
          game_slug?: string
          host_user_id?: string
          id?: string
          invite_code?: string
          is_private?: boolean
          last_activity_at?: string
          max_participants?: number
          pick_deadline_at?: string | null
          snake_order?: number[] | null
          status?: string
          total_rounds?: number
        }
        Relationships: []
      }
      embed_cache: {
        Row: {
          data: Json
          fetched_at: string
          provider: string
          url: string
        }
        Insert: {
          data: Json
          fetched_at?: string
          provider: string
          url: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          provider?: string
          url?: string
        }
        Relationships: []
      }
      event_groups: {
        Row: {
          captain_user_id: string | null
          club_kor: string | null
          color: string
          created_at: string
          event_id: string
          id: string
          motto: string | null
          name: string
          slug: string
          sort_order: number
          source_channel: string | null
        }
        Insert: {
          captain_user_id?: string | null
          club_kor?: string | null
          color: string
          created_at?: string
          event_id: string
          id?: string
          motto?: string | null
          name: string
          slug: string
          sort_order?: number
          source_channel?: string | null
        }
        Update: {
          captain_user_id?: string | null
          club_kor?: string | null
          color?: string
          created_at?: string
          event_id?: string
          id?: string
          motto?: string | null
          name?: string
          slug?: string
          sort_order?: number
          source_channel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_leaderboard_snapshots: {
        Row: {
          accuracy: number | null
          captured_at: string
          event_id: string
          group_id: string
          id: string
          profit_rate: number | null
          rank_in_group: number | null
          settled_slips: number | null
          skill_score: number | null
          total_in_group: number | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          captured_at?: string
          event_id: string
          group_id: string
          id?: string
          profit_rate?: number | null
          rank_in_group?: number | null
          settled_slips?: number | null
          skill_score?: number | null
          total_in_group?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          captured_at?: string
          event_id?: string
          group_id?: string
          id?: string
          profit_rate?: number | null
          rank_in_group?: number | null
          settled_slips?: number | null
          skill_score?: number | null
          total_in_group?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_leaderboard_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_leaderboard_snapshots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          event_id: string
          group_id: string
          id: string
          registered_at: string
          traffic_source: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          group_id: string
          id?: string
          registered_at?: string
          traffic_source?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          group_id?: string
          id?: string
          registered_at?: string
          traffic_source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          end_at: string
          id: string
          league_codes: string[]
          name: string
          prize_description: string | null
          registration_closes_at: string
          slug: string
          start_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_at: string
          id?: string
          league_codes?: string[]
          name: string
          prize_description?: string | null
          registration_closes_at: string
          slug: string
          start_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_at?: string
          id?: string
          league_codes?: string[]
          name?: string
          prize_description?: string | null
          registration_closes_at?: string
          slug?: string
          start_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          question: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          answer: string
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          question?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          artist_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      feature_test_logs: {
        Row: {
          action_type: string
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          response_data: Json | null
          run_id: string
          success: boolean
          target_id: string | null
          target_url: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          response_data?: Json | null
          run_id: string
          success: boolean
          target_id?: string | null
          target_url?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          response_data?: Json | null
          run_id?: string
          success?: boolean
          target_id?: string | null
          target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_test_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      flair_titles: {
        Row: {
          created_at: string
          flair_id: string
          id: string
          name: string
          sort_order: number
          threshold: number
        }
        Insert: {
          created_at?: string
          flair_id: string
          id?: string
          name: string
          sort_order?: number
          threshold: number
        }
        Update: {
          created_at?: string
          flair_id?: string
          id?: string
          name?: string
          sort_order?: number
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "flair_titles_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "post_flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_items: {
        Row: {
          author_handle: string | null
          author_name: string | null
          created_at: string
          created_by: string | null
          id: string
          media: Json
          tag: string | null
          tweet_url: string
        }
        Insert: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media?: Json
          tag?: string | null
          tweet_url: string
        }
        Update: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media?: Json
          tag?: string | null
          tweet_url?: string
        }
        Relationships: []
      }
      gold_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          id: string
          idempotency_key: string | null
          related_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          related_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          related_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gold_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inquiries: {
        Row: {
          admin_reply: string | null
          category: string
          commission_id: string | null
          content: string
          created_at: string | null
          email: string | null
          id: string
          phone: string | null
          priority: string | null
          replied_at: string | null
          replied_by: string | null
          status: string
          subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          category: string
          commission_id?: string | null
          content: string
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          priority?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          category?: string
          commission_id?: string | null
          content?: string
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          priority?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inquiries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      interview_cards: {
        Row: {
          attempt_count: number
          created_at: string
          entry_id: string | null
          error: string | null
          headline_ko: string | null
          hold_reason: string | null
          id: string
          material: string
          occurred_at: string
          quotes: Json
          reservoir_id: string
          saga_id: string | null
          source_title: string
          source_url: string | null
          speaker: string | null
          status: string
          subreddit: string
          team_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          entry_id?: string | null
          error?: string | null
          headline_ko?: string | null
          hold_reason?: string | null
          id?: string
          material: string
          occurred_at: string
          quotes?: Json
          reservoir_id: string
          saga_id?: string | null
          source_title: string
          source_url?: string | null
          speaker?: string | null
          status?: string
          subreddit: string
          team_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          entry_id?: string | null
          error?: string | null
          headline_ko?: string | null
          hold_reason?: string | null
          id?: string
          material?: string
          occurred_at?: string
          quotes?: Json
          reservoir_id?: string
          saga_id?: string | null
          source_title?: string
          source_url?: string | null
          speaker?: string | null
          status?: string
          subreddit?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_cards_reservoir_id_fkey"
            columns: ["reservoir_id"]
            isOneToOne: false
            referencedRelation: "news_reservoir"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_cards_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      invariant_findings: {
        Row: {
          alerted_at: string | null
          detail: Json
          fingerprint: string
          first_seen_at: string
          id: number
          invariant: string
          last_seen_at: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          alerted_at?: string | null
          detail?: Json
          fingerprint: string
          first_seen_at?: string
          id?: never
          invariant: string
          last_seen_at?: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          alerted_at?: string | null
          detail?: Json
          fingerprint?: string
          first_seen_at?: string
          id?: never
          invariant?: string
          last_seen_at?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      league_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: string
          league_id: string | null
          source: string
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: string
          league_id?: string | null
          source?: string
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: string
          league_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_aliases_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          name_ko: string | null
          sport_type: string
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id: string
          is_active?: boolean | null
          name: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      lfa_day_cache: {
        Row: {
          date_utc: string
          match_count: number
          payload: Json
          updated_at: string
        }
        Insert: {
          date_utc: string
          match_count?: number
          payload: Json
          updated_at?: string
        }
        Update: {
          date_utc?: string
          match_count?: number
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      lfa_team_names: {
        Row: {
          created_at: string
          lfa_team_id: string | null
          name_en: string
          name_kr: string
          note: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          lfa_team_id?: string | null
          name_en: string
          name_kr: string
          note?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          lfa_team_id?: string | null
          name_en?: string
          name_kr?: string
          note?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lfa_usage_log: {
        Row: {
          called_at: string
          credits_remaining: number | null
          endpoint: string
          id: number
        }
        Insert: {
          called_at?: string
          credits_remaining?: number | null
          endpoint: string
          id?: number
        }
        Update: {
          called_at?: string
          credits_remaining?: number | null
          endpoint?: string
          id?: number
        }
        Relationships: []
      }
      live_rooms: {
        Row: {
          closed_at: string | null
          created_at: string | null
          game_id: string | null
          id: string
          name: string
          sport: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          name: string
          sport?: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          game_id?: string | null
          id?: string
          name?: string
          sport?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_rooms_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage_log: {
        Row: {
          cached_tokens: number | null
          called_at: string
          estimated_cost_usd: number | null
          fail_reason: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string
          ok: boolean
          output_tokens: number | null
          task: string
        }
        Insert: {
          cached_tokens?: number | null
          called_at?: string
          estimated_cost_usd?: number | null
          fail_reason?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          ok?: boolean
          output_tokens?: number | null
          task: string
        }
        Update: {
          cached_tokens?: number | null
          called_at?: string
          estimated_cost_usd?: number | null
          fail_reason?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          ok?: boolean
          output_tokens?: number | null
          task?: string
        }
        Relationships: []
      }
      match_details_cache: {
        Row: {
          finished: boolean
          game_id: string
          lfa_match_id: string | null
          payload: Json
          updated_at: string
        }
        Insert: {
          finished?: boolean
          game_id: string
          lfa_match_id?: string | null
          payload: Json
          updated_at?: string
        }
        Update: {
          finished?: boolean
          game_id?: string
          lfa_match_id?: string | null
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      match_lineups: {
        Row: {
          created_at: string
          event_id: string
          game_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          game_id: string
          payload: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          game_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      match_mapping_attempts: {
        Row: {
          attempt: number
          away_team_id: string | null
          candidate_url: string | null
          created_at: string
          error: string | null
          game_id: string
          home_away_flip: boolean | null
          home_team_id: string | null
          id: string
          input_hash: string
          latency_ms: number | null
          outcome: string
          page_away_en: string | null
          page_date: string | null
          page_home_en: string | null
          page_tournament: string | null
          predicate_version: string
          run_id: string
          soccerway_mid: string | null
          status: string
          unresolved_names: string[]
        }
        Insert: {
          attempt?: number
          away_team_id?: string | null
          candidate_url?: string | null
          created_at?: string
          error?: string | null
          game_id: string
          home_away_flip?: boolean | null
          home_team_id?: string | null
          id?: string
          input_hash: string
          latency_ms?: number | null
          outcome: string
          page_away_en?: string | null
          page_date?: string | null
          page_home_en?: string | null
          page_tournament?: string | null
          predicate_version: string
          run_id: string
          soccerway_mid?: string | null
          status?: string
          unresolved_names?: string[]
        }
        Update: {
          attempt?: number
          away_team_id?: string | null
          candidate_url?: string | null
          created_at?: string
          error?: string | null
          game_id?: string
          home_away_flip?: boolean | null
          home_team_id?: string | null
          id?: string
          input_hash?: string
          latency_ms?: number | null
          outcome?: string
          page_away_en?: string | null
          page_date?: string | null
          page_home_en?: string | null
          page_tournament?: string | null
          predicate_version?: string
          run_id?: string
          soccerway_mid?: string | null
          status?: string
          unresolved_names?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "match_mapping_attempts_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "team_dictionary"
            referencedColumns: ["soccerway_team_id"]
          },
          {
            foreignKeyName: "match_mapping_attempts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_mapping_attempts_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "team_dictionary"
            referencedColumns: ["soccerway_team_id"]
          },
        ]
      }
      match_odds: {
        Row: {
          asian_handicap: Json | null
          both_teams_to_score: Json | null
          correct_score: Json | null
          created_at: string | null
          double_chance: Json | null
          event_id: string | null
          fi: string | null
          first_goal_scorer: Json | null
          full_time_result: Json | null
          goal_line: Json | null
          goals_over_under: Json | null
          half_time_over_under: Json | null
          half_time_result: Json | null
          id: string
          last_goal_scorer: Json | null
          match_id: string
          odds_updated_at: string | null
          raw_odds: Json | null
        }
        Insert: {
          asian_handicap?: Json | null
          both_teams_to_score?: Json | null
          correct_score?: Json | null
          created_at?: string | null
          double_chance?: Json | null
          event_id?: string | null
          fi?: string | null
          first_goal_scorer?: Json | null
          full_time_result?: Json | null
          goal_line?: Json | null
          goals_over_under?: Json | null
          half_time_over_under?: Json | null
          half_time_result?: Json | null
          id?: string
          last_goal_scorer?: Json | null
          match_id: string
          odds_updated_at?: string | null
          raw_odds?: Json | null
        }
        Update: {
          asian_handicap?: Json | null
          both_teams_to_score?: Json | null
          correct_score?: Json | null
          created_at?: string | null
          double_chance?: Json | null
          event_id?: string | null
          fi?: string | null
          first_goal_scorer?: Json | null
          full_time_result?: Json | null
          goal_line?: Json | null
          goals_over_under?: Json | null
          half_time_over_under?: Json | null
          half_time_result?: Json | null
          id?: string
          last_goal_scorer?: Json | null
          match_id?: string
          odds_updated_at?: string | null
          raw_odds?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "match_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_preview_cache: {
        Row: {
          lfa_match_id: string
          payload: Json
          settled: boolean
          updated_at: string
        }
        Insert: {
          lfa_match_id: string
          payload: Json
          settled?: boolean
          updated_at?: string
        }
        Update: {
          lfa_match_id?: string
          payload?: Json
          settled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      match_previews: {
        Row: {
          audit: Json
          away_team: string | null
          created_at: string
          error: string | null
          game_id: string | null
          home_team: string | null
          id: string
          kickoff_at: string | null
          league: string | null
          post_id: string | null
          published_at: string | null
          raw_text: string | null
          rewritten: Json | null
          soccerway_mid: string
          soccerway_url: string
          status: string
        }
        Insert: {
          audit?: Json
          away_team?: string | null
          created_at?: string
          error?: string | null
          game_id?: string | null
          home_team?: string | null
          id?: string
          kickoff_at?: string | null
          league?: string | null
          post_id?: string | null
          published_at?: string | null
          raw_text?: string | null
          rewritten?: Json | null
          soccerway_mid: string
          soccerway_url: string
          status?: string
        }
        Update: {
          audit?: Json
          away_team?: string | null
          created_at?: string
          error?: string | null
          game_id?: string | null
          home_team?: string | null
          id?: string
          kickoff_at?: string | null
          league?: string | null
          post_id?: string | null
          published_at?: string | null
          raw_text?: string | null
          rewritten?: Json | null
          soccerway_mid?: string
          soccerway_url?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_previews_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_previews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_previews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      match_report_attempts: {
        Row: {
          attempted_at: string
          event_id: string | null
          game_id: string
          id: number
          reason: string | null
          stage: string
        }
        Insert: {
          attempted_at?: string
          event_id?: string | null
          game_id: string
          id?: never
          reason?: string | null
          stage: string
        }
        Update: {
          attempted_at?: string
          event_id?: string | null
          game_id?: string
          id?: never
          reason?: string | null
          stage?: string
        }
        Relationships: []
      }
      match_reports: {
        Row: {
          created_at: string
          event_id: string
          game_id: string
          paragraphs: string[]
          title: string
        }
        Insert: {
          created_at?: string
          event_id: string
          game_id: string
          paragraphs: string[]
          title: string
        }
        Update: {
          created_at?: string
          event_id?: string
          game_id?: string
          paragraphs?: string[]
          title?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_team_id: string | null
          created_at: string | null
          events: Json | null
          extra: Json | null
          home_team_id: string | null
          id: string
          is_prediction_open: boolean | null
          league_id: string | null
          match_time: string
          prediction_close_time: string | null
          prediction_count: number | null
          score_away: number | null
          score_home: number | null
          scores: Json | null
          sport_type: string
          stats: Json | null
          time_status: number
          updated_at: string | null
        }
        Insert: {
          away_team_id?: string | null
          created_at?: string | null
          events?: Json | null
          extra?: Json | null
          home_team_id?: string | null
          id: string
          is_prediction_open?: boolean | null
          league_id?: string | null
          match_time: string
          prediction_close_time?: string | null
          prediction_count?: number | null
          score_away?: number | null
          score_home?: number | null
          scores?: Json | null
          sport_type?: string
          stats?: Json | null
          time_status?: number
          updated_at?: string | null
        }
        Update: {
          away_team_id?: string | null
          created_at?: string | null
          events?: Json | null
          extra?: Json | null
          home_team_id?: string | null
          id?: string
          is_prediction_open?: boolean | null
          league_id?: string | null
          match_time?: string
          prediction_close_time?: string | null
          prediction_count?: number | null
          score_away?: number | null
          score_home?: number | null
          scores?: Json | null
          sport_type?: string
          stats?: Json | null
          time_status?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      metaverse_avatar_inventory: {
        Row: {
          acquired_at: string
          avatar_key: string
          price_paid_gold: number | null
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          avatar_key: string
          price_paid_gold?: number | null
          source?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          avatar_key?: string
          price_paid_gold?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metaverse_avatar_inventory_avatar_key_fkey"
            columns: ["avatar_key"]
            isOneToOne: false
            referencedRelation: "metaverse_avatar_items"
            referencedColumns: ["avatar_key"]
          },
        ]
      }
      metaverse_avatar_items: {
        Row: {
          avatar_key: string
          created_at: string
          description: string | null
          is_active: boolean
          is_default: boolean
          name: string
          price_gold: number
          sort_order: number
        }
        Insert: {
          avatar_key: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_default?: boolean
          name: string
          price_gold: number
          sort_order?: number
        }
        Update: {
          avatar_key?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_default?: boolean
          name?: string
          price_gold?: number
          sort_order?: number
        }
        Relationships: []
      }
      metaverse_chat_rooms: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          last_activity_at: string
          owner_user_id: string
          plot_id: string
          sign_text: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          owner_user_id: string
          plot_id: string
          sign_text: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          owner_user_id?: string
          plot_id?: string
          sign_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "metaverse_chat_rooms_plot_id_fkey"
            columns: ["plot_id"]
            isOneToOne: false
            referencedRelation: "metaverse_world_plots"
            referencedColumns: ["id"]
          },
        ]
      }
      metaverse_fandom_memberships: {
        Row: {
          id: string
          joined_at: string
          joined_with_points: number
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          joined_with_points: number
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          joined_with_points?: number
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metaverse_fandom_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      metaverse_user_activity_balance: {
        Row: {
          created_at: string
          lifetime_earned: number
          spendable_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lifetime_earned?: number
          spendable_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lifetime_earned?: number
          spendable_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metaverse_user_reports: {
        Row: {
          context_room_id: string | null
          context_scope: string | null
          created_at: string
          created_date: string
          id: string
          note: string | null
          reason: string
          reported_user_id: string
          reporter_user_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          context_room_id?: string | null
          context_scope?: string | null
          created_at?: string
          created_date?: string
          id?: string
          note?: string | null
          reason: string
          reported_user_id: string
          reporter_user_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          context_room_id?: string | null
          context_scope?: string | null
          created_at?: string
          created_date?: string
          id?: string
          note?: string | null
          reason?: string
          reported_user_id?: string
          reporter_user_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "metaverse_user_reports_context_room_id_fkey"
            columns: ["context_room_id"]
            isOneToOne: false
            referencedRelation: "metaverse_chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      metaverse_world_plots: {
        Row: {
          created_at: string
          height_units: number
          id: string
          is_active: boolean
          pin_x: number
          pin_y: number
          plaza_name: string
          plot_code: string
          width_units: number
        }
        Insert: {
          created_at?: string
          height_units?: number
          id?: string
          is_active?: boolean
          pin_x: number
          pin_y: number
          plaza_name: string
          plot_code: string
          width_units?: number
        }
        Update: {
          created_at?: string
          height_units?: number
          id?: string
          is_active?: boolean
          pin_x?: number
          pin_y?: number
          plaza_name?: string
          plot_code?: string
          width_units?: number
        }
        Relationships: []
      }
      minigame_scores: {
        Row: {
          created_at: string
          game: string
          id: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          game: string
          id?: string
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          game?: string
          id?: string
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      news_alias_dictionary: {
        Row: {
          category: string
          confidence: number
          disambiguation: string | null
          hangul_alts: string[] | null
          id: string
          ko_first_seen: string | null
          notes: string | null
          preferred_ko: string
          romanized: string
          surfaces: string[]
          updated_at: string
        }
        Insert: {
          category: string
          confidence: number
          disambiguation?: string | null
          hangul_alts?: string[] | null
          id: string
          ko_first_seen?: string | null
          notes?: string | null
          preferred_ko: string
          romanized: string
          surfaces: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          confidence?: number
          disambiguation?: string | null
          hangul_alts?: string[] | null
          id?: string
          ko_first_seen?: string | null
          notes?: string | null
          preferred_ko?: string
          romanized?: string
          surfaces?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      news_assignments: {
        Row: {
          attempt: number
          cached_tokens: number | null
          candidate_id: string
          content_hash: string
          created_at: string
          deadline_minutes: number | null
          desk: string | null
          details: Json
          error: string | null
          estimated_cost_usd: number | null
          format: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string
          outcome: string
          output_tokens: number | null
          priority: number | null
          prompt_version: string
          reason_codes: string[]
          required_checks: string[]
          risk: string | null
          run_id: string
          status: string
        }
        Insert: {
          attempt?: number
          cached_tokens?: number | null
          candidate_id: string
          content_hash: string
          created_at?: string
          deadline_minutes?: number | null
          desk?: string | null
          details?: Json
          error?: string | null
          estimated_cost_usd?: number | null
          format?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          outcome: string
          output_tokens?: number | null
          priority?: number | null
          prompt_version: string
          reason_codes?: string[]
          required_checks?: string[]
          risk?: string | null
          run_id: string
          status?: string
        }
        Update: {
          attempt?: number
          cached_tokens?: number | null
          candidate_id?: string
          content_hash?: string
          created_at?: string
          deadline_minutes?: number | null
          desk?: string | null
          details?: Json
          error?: string | null
          estimated_cost_usd?: number | null
          format?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          outcome?: string
          output_tokens?: number | null
          priority?: number | null
          prompt_version?: string
          reason_codes?: string[]
          required_checks?: string[]
          risk?: string | null
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      news_candidate_events: {
        Row: {
          actor: string
          candidate_id: string
          created_at: string
          details: Json
          from_state: string | null
          id: number
          reason_code: string | null
          run_id: string | null
          to_state: string
        }
        Insert: {
          actor: string
          candidate_id: string
          created_at?: string
          details?: Json
          from_state?: string | null
          id?: never
          reason_code?: string | null
          run_id?: string | null
          to_state: string
        }
        Update: {
          actor?: string
          candidate_id?: string
          created_at?: string
          details?: Json
          from_state?: string | null
          id?: never
          reason_code?: string | null
          run_id?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_candidate_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      news_candidates: {
        Row: {
          candidate_id: string
          canonical_url: string | null
          content_hash: string | null
          dedupe_key: string | null
          first_seen_at: string
          last_reason_code: string | null
          priority: number | null
          reservoir_id: string | null
          risk: string | null
          source: Json
          state: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          canonical_url?: string | null
          content_hash?: string | null
          dedupe_key?: string | null
          first_seen_at?: string
          last_reason_code?: string | null
          priority?: number | null
          reservoir_id?: string | null
          risk?: string | null
          source?: Json
          state?: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          canonical_url?: string | null
          content_hash?: string | null
          dedupe_key?: string | null
          first_seen_at?: string
          last_reason_code?: string | null
          priority?: number | null
          reservoir_id?: string | null
          risk?: string | null
          source?: Json
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_error_reports: {
        Row: {
          claim: string
          comment_id: string
          comment_text: string
          comment_user_id: string | null
          created_at: string
          id: string
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          claim: string
          comment_id: string
          comment_text: string
          comment_user_id?: string | null
          created_at?: string
          id?: string
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          claim?: string
          comment_id?: string
          comment_text?: string
          comment_user_id?: string | null
          created_at?: string
          id?: string
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_error_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_error_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_error_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      news_reservoir: {
        Row: {
          assignment: Json | null
          audit: Json
          created_at: string
          decision: Json | null
          dedupe_key: string
          draft: Json | null
          entities: Json | null
          external_key: string | null
          id: string
          issue_type: string | null
          normalized: Json | null
          publish: Json | null
          raw: Json
          scores: Json
          source: Json
          status: string
          tags: string[] | null
          unresolved: Json | null
          updated_at: string
          urls: Json
        }
        Insert: {
          assignment?: Json | null
          audit?: Json
          created_at?: string
          decision?: Json | null
          dedupe_key: string
          draft?: Json | null
          entities?: Json | null
          external_key?: string | null
          id: string
          issue_type?: string | null
          normalized?: Json | null
          publish?: Json | null
          raw: Json
          scores: Json
          source: Json
          status: string
          tags?: string[] | null
          unresolved?: Json | null
          updated_at?: string
          urls: Json
        }
        Update: {
          assignment?: Json | null
          audit?: Json
          created_at?: string
          decision?: Json | null
          dedupe_key?: string
          draft?: Json | null
          entities?: Json | null
          external_key?: string | null
          id?: string
          issue_type?: string | null
          normalized?: Json | null
          publish?: Json | null
          raw?: Json
          scores?: Json
          source?: Json
          status?: string
          tags?: string[] | null
          unresolved?: Json | null
          updated_at?: string
          urls?: Json
        }
        Relationships: []
      }
      news_ticker_items: {
        Row: {
          author: string | null
          category: string
          community_slug: string
          created_at: string | null
          external_id: string
          external_url: string
          flair: string | null
          headline_kr: string
          id: number
          importance: number | null
          link_url: string | null
          media_type: string | null
          num_comments: number | null
          original_title: string
          posted_at: string
          score: number | null
          source_id: string
          summary_kr: string
          thumbnail_url: string | null
          ticker_tag: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          category?: string
          community_slug: string
          created_at?: string | null
          external_id: string
          external_url: string
          flair?: string | null
          headline_kr: string
          id?: never
          importance?: number | null
          link_url?: string | null
          media_type?: string | null
          num_comments?: number | null
          original_title: string
          posted_at: string
          score?: number | null
          source_id: string
          summary_kr: string
          thumbnail_url?: string | null
          ticker_tag?: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          category?: string
          community_slug?: string
          created_at?: string | null
          external_id?: string
          external_url?: string
          flair?: string | null
          headline_kr?: string
          id?: never
          importance?: number | null
          link_url?: string | null
          media_type?: string | null
          num_comments?: number | null
          original_title?: string
          posted_at?: string
          score?: number | null
          source_id?: string
          summary_kr?: string
          thumbnail_url?: string | null
          ticker_tag?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          metadata: Json | null
          related_comment_id: string | null
          related_post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          related_comment_id?: string | null
          related_post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          related_comment_id?: string | null
          related_post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_comment_id_fkey"
            columns: ["related_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      noun_titles: {
        Row: {
          board_slug: string
          created_at: string | null
          id: string
          price: number
          required_level: number
          required_points: number
          title: string
        }
        Insert: {
          board_slug: string
          created_at?: string | null
          id?: string
          price?: number
          required_level: number
          required_points?: number
          title: string
        }
        Update: {
          board_slug?: string
          created_at?: string | null
          id?: string
          price?: number
          required_level?: number
          required_points?: number
          title?: string
        }
        Relationships: []
      }
      pending_refunds: {
        Row: {
          amount: number
          attempts: number
          created_at: string | null
          currency: string
          description: string | null
          id: string
          last_error: string | null
          related_slip_id: string | null
          resolved_at: string | null
          source: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          attempts?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          last_error?: string | null
          related_slip_id?: string | null
          resolved_at?: string | null
          source: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          attempts?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          last_error?: string | null
          related_slip_id?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pending_seller_rewards: {
        Row: {
          activity_id: string
          amount: number
          attempts: number
          buyer_id: string
          created_at: string | null
          description: string | null
          id: string
          last_error: string | null
          purchase_id: string | null
          resolved_at: string | null
          seller_id: string
          status: string
          transaction_type: string
        }
        Insert: {
          activity_id: string
          amount: number
          attempts?: number
          buyer_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          purchase_id?: string | null
          resolved_at?: string | null
          seller_id: string
          status?: string
          transaction_type?: string
        }
        Update: {
          activity_id?: string
          amount?: number
          attempts?: number
          buyer_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          purchase_id?: string | null
          resolved_at?: string | null
          seller_id?: string
          status?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_seller_rewards_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pending_seller_rewards_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pixel_art_items: {
        Row: {
          board_slug: string | null
          category: string
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_limited: boolean | null
          name: string
          price: number
          slug: string
        }
        Insert: {
          board_slug?: string | null
          category: string
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_limited?: boolean | null
          name: string
          price: number
          slug: string
        }
        Update: {
          board_slug?: string | null
          category?: string
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_limited?: boolean | null
          name?: string
          price?: number
          slug?: string
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          amount: number
          board_slug: string
          created_at: string | null
          description: string | null
          id: string
          related_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          board_slug: string
          created_at?: string | null
          description?: string | null
          id?: string
          related_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          board_slug?: string
          created_at?: string | null
          description?: string | null
          id?: string
          related_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_key: string
          poll_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_key: string
          poll_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_key?: string
          poll_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          allow_reason: boolean
          closes_at: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          game_id: string | null
          id: string
          is_active: boolean
          kind: string
          match_key: string | null
          off_reason: string | null
          options: Json
          post_id: string | null
          question: string
          summary: Json | null
        }
        Insert: {
          allow_reason?: boolean
          closes_at?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          match_key?: string | null
          off_reason?: string | null
          options: Json
          post_id?: string | null
          question: string
          summary?: Json | null
        }
        Update: {
          allow_reason?: boolean
          closes_at?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          match_key?: string | null
          off_reason?: string | null
          options?: Json
          post_id?: string | null
          question?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_flair_map: {
        Row: {
          created_at: string
          flair_id: string
          post_id: string
        }
        Insert: {
          created_at?: string
          flair_id: string
          post_id: string
        }
        Update: {
          created_at?: string
          flair_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_flair_map_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "post_flairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_flair_map_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_flair_map_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_flairs: {
        Row: {
          color: string | null
          community_slug: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          team_id: string | null
        }
        Insert: {
          color?: string | null
          community_slug: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          team_id?: string | null
        }
        Update: {
          color?: string | null
          community_slug?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_flairs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string | null
          id: string
          ip_hash: string
          post_id: string
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_hash: string
          post_id: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_hash?: string
          post_id?: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          category_id: string
          comment_count: number | null
          community_slug: string | null
          content: Json
          created_at: string | null
          deleted_at: string | null
          flair_id: string | null
          flair_team_id: string | null
          hero_pinned_at: string | null
          id: string
          image: string | null
          is_global_notice: boolean | null
          is_notice: boolean | null
          last_comment_at: string | null
          match_game_id: string | null
          scoring_version: string | null
          source_name: string | null
          source_url: string | null
          temp_score_updated_at: string | null
          temperature: number | null
          title: string
          updated_at: string | null
          user_id: string
          view_count: number | null
          view_count_unique: number
          vote_count: number | null
        }
        Insert: {
          category_id: string
          comment_count?: number | null
          community_slug?: string | null
          content: Json
          created_at?: string | null
          deleted_at?: string | null
          flair_id?: string | null
          flair_team_id?: string | null
          hero_pinned_at?: string | null
          id?: string
          image?: string | null
          is_global_notice?: boolean | null
          is_notice?: boolean | null
          last_comment_at?: string | null
          match_game_id?: string | null
          scoring_version?: string | null
          source_name?: string | null
          source_url?: string | null
          temp_score_updated_at?: string | null
          temperature?: number | null
          title: string
          updated_at?: string | null
          user_id: string
          view_count?: number | null
          view_count_unique?: number
          vote_count?: number | null
        }
        Update: {
          category_id?: string
          comment_count?: number | null
          community_slug?: string | null
          content?: Json
          created_at?: string | null
          deleted_at?: string | null
          flair_id?: string | null
          flair_team_id?: string | null
          hero_pinned_at?: string | null
          id?: string
          image?: string | null
          is_global_notice?: boolean | null
          is_notice?: boolean | null
          last_comment_at?: string | null
          match_game_id?: string | null
          scoring_version?: string | null
          source_name?: string | null
          source_url?: string | null
          temp_score_updated_at?: string | null
          temperature?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
          view_count?: number | null
          view_count_unique?: number
          vote_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "post_flairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_flair_team_id_fkey"
            columns: ["flair_team_id"]
            isOneToOne: false
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      prediction_activities: {
        Row: {
          created_at: string | null
          daily_round_id: string | null
          id: string
          prediction_count: number
          round_id: string
          sport: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_round_id?: string | null
          id?: string
          prediction_count: number
          round_id: string
          sport: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_round_id?: string | null
          id?: string
          prediction_count?: number
          round_id?: string
          sport?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_activities_daily_round_id_fkey"
            columns: ["daily_round_id"]
            isOneToOne: false
            referencedRelation: "betman_daily_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_activities_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "betman_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_purchases: {
        Row: {
          activity_id: string
          buyer_id: string
          created_at: string | null
          gold_spent: number
          id: string
          seller_id: string
        }
        Insert: {
          activity_id: string
          buyer_id: string
          created_at?: string | null
          gold_spent?: number
          id?: string
          seller_id: string
        }
        Update: {
          activity_id?: string
          buyer_id?: string
          created_at?: string | null
          gold_spent?: number
          id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_purchases_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "prediction_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      prediction_seasons: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          league_id: string | null
          name: string
          prize_pool: Json | null
          sport_type: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          league_id?: string | null
          name: string
          prize_pool?: Json | null
          sport_type?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          league_id?: string | null
          name?: string
          prize_pool?: Json | null
          sport_type?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_slips: {
        Row: {
          analysis_text: string | null
          analysis_title: string | null
          created_at: string | null
          daily_round_id: string | null
          event_id: string | null
          id: string
          idempotency_key: string | null
          sport: string
          stake: number
          status: string
          total_odds: number
          user_id: string
        }
        Insert: {
          analysis_text?: string | null
          analysis_title?: string | null
          created_at?: string | null
          daily_round_id?: string | null
          event_id?: string | null
          id?: string
          idempotency_key?: string | null
          sport: string
          stake?: number
          status?: string
          total_odds?: number
          user_id: string
        }
        Update: {
          analysis_text?: string | null
          analysis_title?: string | null
          created_at?: string | null
          daily_round_id?: string | null
          event_id?: string | null
          id?: string
          idempotency_key?: string | null
          sport?: string
          stake?: number
          status?: string
          total_odds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_slips_daily_round_id_fkey"
            columns: ["daily_round_id"]
            isOneToOne: false
            referencedRelation: "betman_daily_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prediction_slips_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean | null
          match_id: string
          odds_at_prediction: number | null
          points_wagered: number | null
          points_won: number | null
          potential_win: number | null
          prediction_type: string
          prediction_value: string
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          match_id: string
          odds_at_prediction?: number | null
          points_wagered?: number | null
          points_won?: number | null
          potential_win?: number | null
          prediction_type: string
          prediction_value: string
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          match_id?: string
          odds_at_prediction?: number | null
          points_wagered?: number | null
          points_won?: number | null
          potential_win?: number | null
          prediction_type?: string
          prediction_value?: string
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          artist_bio: string | null
          avatar_url: string | null
          bio: string | null
          comment_count: number | null
          commission_status: string
          created_at: string | null
          deleted_at: string | null
          display_title_id: string | null
          equipped_pixel_art_id: string | null
          expert_certified_at: string | null
          favorite_player: string | null
          favorite_team: string | null
          grade: string | null
          id: string
          is_artist: boolean
          is_expert: boolean | null
          is_journalist: boolean | null
          journalist_certified_at: string | null
          metaverse_avatar_key: string | null
          nickname: string
          nickname_changed_at: string | null
          onboarding_completed: boolean | null
          post_count: number | null
          role: string | null
          specialties: string[] | null
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artist_bio?: string | null
          avatar_url?: string | null
          bio?: string | null
          comment_count?: number | null
          commission_status?: string
          created_at?: string | null
          deleted_at?: string | null
          display_title_id?: string | null
          equipped_pixel_art_id?: string | null
          expert_certified_at?: string | null
          favorite_player?: string | null
          favorite_team?: string | null
          grade?: string | null
          id?: string
          is_artist?: boolean
          is_expert?: boolean | null
          is_journalist?: boolean | null
          journalist_certified_at?: string | null
          metaverse_avatar_key?: string | null
          nickname: string
          nickname_changed_at?: string | null
          onboarding_completed?: boolean | null
          post_count?: number | null
          role?: string | null
          specialties?: string[] | null
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artist_bio?: string | null
          avatar_url?: string | null
          bio?: string | null
          comment_count?: number | null
          commission_status?: string
          created_at?: string | null
          deleted_at?: string | null
          display_title_id?: string | null
          equipped_pixel_art_id?: string | null
          expert_certified_at?: string | null
          favorite_player?: string | null
          favorite_team?: string | null
          grade?: string | null
          id?: string
          is_artist?: boolean
          is_expert?: boolean | null
          is_journalist?: boolean | null
          journalist_certified_at?: string | null
          metaverse_avatar_key?: string | null
          nickname?: string
          nickname_changed_at?: string | null
          onboarding_completed?: boolean | null
          post_count?: number | null
          role?: string | null
          specialties?: string[] | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_display_title_id_fkey"
            columns: ["display_title_id"]
            isOneToOne: false
            referencedRelation: "flair_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipped_pixel_art_id_fkey"
            columns: ["equipped_pixel_art_id"]
            isOneToOne: false
            referencedRelation: "pixel_art_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchased_content: {
        Row: {
          id: string
          prediction_id: string
          purchase_price: number
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          prediction_id: string
          purchase_price: number
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          prediction_id?: string
          purchase_price?: number
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchased_content_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchased_content_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reviews: {
        Row: {
          artist_id: string
          commission_id: string
          content: string | null
          created_at: string | null
          id: string
          rating: number
          reviewer_id: string
        }
        Insert: {
          artist_id: string
          commission_id: string
          content?: string | null
          created_at?: string | null
          id?: string
          rating: number
          reviewer_id: string
        }
        Update: {
          artist_id?: string
          commission_id?: string
          content?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      saga_article_links: {
        Row: {
          created_at: string
          entry_id: string | null
          post_id: string
          saga_id: string
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          post_id: string
          saga_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          post_id?: string
          saga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_article_links_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "saga_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_article_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_article_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_article_links_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_comment_stances: {
        Row: {
          comment_id: string
          created_at: string
          saga_id: string
          stance: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          saga_id: string
          stance?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          saga_id?: string
          stance?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saga_comment_stances_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_comment_stances_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_entries: {
        Row: {
          cluster_key: string
          created_at: string
          echoes: Json
          headline: string
          id: string
          occurred_at: string
          origin: Json
          saga_id: string
          stage_after: string | null
          summary: string | null
          tier: string
        }
        Insert: {
          cluster_key: string
          created_at?: string
          echoes?: Json
          headline: string
          id?: string
          occurred_at: string
          origin: Json
          saga_id: string
          stage_after?: string | null
          summary?: string | null
          tier: string
        }
        Update: {
          cluster_key?: string
          created_at?: string
          echoes?: Json
          headline?: string
          id?: string
          occurred_at?: string
          origin?: Json
          saga_id?: string
          stage_after?: string | null
          summary?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_entries_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_reservoir: {
        Row: {
          cluster_key: string | null
          created_at: string
          error: string | null
          extracted: Json | null
          headline_kr: string | null
          id: string
          occurred_at: string
          raw: Json
          saga_hint: string | null
          source: Json
          source_url: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          cluster_key?: string | null
          created_at?: string
          error?: string | null
          extracted?: Json | null
          headline_kr?: string | null
          id?: string
          occurred_at?: string
          raw?: Json
          saga_hint?: string | null
          source?: Json
          source_url: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          cluster_key?: string | null
          created_at?: string
          error?: string | null
          extracted?: Json | null
          headline_kr?: string | null
          id?: string
          occurred_at?: string
          raw?: Json
          saga_hint?: string | null
          source?: Json
          source_url?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      saga_settlements: {
        Row: {
          awarded_at: string | null
          choice: string
          correct: boolean
          created_at: string
          points: number
          saga_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string | null
          choice: string
          correct: boolean
          created_at?: string
          points?: number
          saga_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string | null
          choice?: string
          correct?: boolean
          created_at?: string
          points?: number
          saga_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_settlements_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_votes: {
        Row: {
          choice: string
          created_at: string
          entry_id: string | null
          id: string
          saga_id: string
          scope: string
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          entry_id?: string | null
          id?: string
          saga_id: string
          scope: string
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          entry_id?: string | null
          id?: string
          saga_id?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saga_votes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "saga_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saga_votes_saga_id_fkey"
            columns: ["saga_id"]
            isOneToOne: false
            referencedRelation: "sagas"
            referencedColumns: ["id"]
          },
        ]
      }
      sagas: {
        Row: {
          anchor_post_id: string
          closed_at: string | null
          created_at: string
          entry_count: number
          id: string
          identity_key: string
          is_confirmed: boolean
          last_event_at: string
          outcome: string | null
          saga_type: string
          settled_at: string | null
          slug: string
          stage: string
          status: string
          subject: Json
          summary: string | null
          title: string
          updated_at: string
          window_key: string
        }
        Insert: {
          anchor_post_id: string
          closed_at?: string | null
          created_at?: string
          entry_count?: number
          id?: string
          identity_key: string
          is_confirmed?: boolean
          last_event_at?: string
          outcome?: string | null
          saga_type: string
          settled_at?: string | null
          slug: string
          stage?: string
          status?: string
          subject: Json
          summary?: string | null
          title: string
          updated_at?: string
          window_key: string
        }
        Update: {
          anchor_post_id?: string
          closed_at?: string | null
          created_at?: string
          entry_count?: number
          id?: string
          identity_key?: string
          is_confirmed?: boolean
          last_event_at?: string
          outcome?: string | null
          saga_type?: string
          settled_at?: string | null
          slug?: string
          stage?: string
          status?: string
          subject?: Json
          summary?: string | null
          title?: string
          updated_at?: string
          window_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "sagas_anchor_post_id_fkey"
            columns: ["anchor_post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sagas_anchor_post_id_fkey"
            columns: ["anchor_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_config: {
        Row: {
          created_at: string | null
          decay_half_life: number
          is_active: boolean | null
          new_boost_max: number
          version: string
          w_comment: number
          w_up: number
          w_view: number
        }
        Insert: {
          created_at?: string | null
          decay_half_life: number
          is_active?: boolean | null
          new_boost_max: number
          version: string
          w_comment: number
          w_up: number
          w_view: number
        }
        Update: {
          created_at?: string | null
          decay_half_life?: number
          is_active?: boolean | null
          new_boost_max?: number
          version?: string
          w_comment?: number
          w_up?: number
          w_view?: number
        }
        Relationships: []
      }
      season_chicken_draws: {
        Row: {
          announced_post_id: string | null
          created_at: string
          draw_date: string
          entrant_count: number
          event_id: string
          id: string
          user_id: string
          winner_comment_count: number
        }
        Insert: {
          announced_post_id?: string | null
          created_at?: string
          draw_date: string
          entrant_count: number
          event_id: string
          id?: string
          user_id: string
          winner_comment_count: number
        }
        Update: {
          announced_post_id?: string | null
          created_at?: string
          draw_date?: string
          entrant_count?: number
          event_id?: string
          id?: string
          user_id?: string
          winner_comment_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_chicken_draws_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      season_weekly_draws: {
        Row: {
          announced_post_id: string | null
          candidate_count: number
          candidates: Json
          candidates_hash: string | null
          created_at: string
          drawn_at: string | null
          drawn_by: string | null
          duel_scores: Json | null
          duel_winner_group_id: string | null
          event_id: string
          id: string
          snapshot_at: string | null
          uniform_winner: Json | null
          week_start: string
          winner_count: number
          winners: Json | null
        }
        Insert: {
          announced_post_id?: string | null
          candidate_count?: number
          candidates?: Json
          candidates_hash?: string | null
          created_at?: string
          drawn_at?: string | null
          drawn_by?: string | null
          duel_scores?: Json | null
          duel_winner_group_id?: string | null
          event_id: string
          id?: string
          snapshot_at?: string | null
          uniform_winner?: Json | null
          week_start: string
          winner_count?: number
          winners?: Json | null
        }
        Update: {
          announced_post_id?: string | null
          candidate_count?: number
          candidates?: Json
          candidates_hash?: string | null
          created_at?: string
          drawn_at?: string | null
          drawn_by?: string | null
          duel_scores?: Json | null
          duel_winner_group_id?: string | null
          event_id?: string
          id?: string
          snapshot_at?: string | null
          uniform_winner?: Json | null
          week_start?: string
          winner_count?: number
          winners?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "season_weekly_draws_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      seeded_reddit_posts: {
        Row: {
          community_slug: string
          created_at: string | null
          id: string
          original_title: string
          post_id: string | null
          reddit_id: string
          subreddit: string
        }
        Insert: {
          community_slug: string
          created_at?: string | null
          id?: string
          original_title: string
          post_id?: string | null
          reddit_id: string
          subreddit: string
        }
        Update: {
          community_slug?: string
          created_at?: string | null
          id?: string
          original_title?: string
          post_id?: string | null
          reddit_id?: string
          subreddit?: string
        }
        Relationships: [
          {
            foreignKeyName: "seeded_reddit_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seeded_reddit_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_audit_log: {
        Row: {
          actor: string
          after_state: Json
          amount: number | null
          before_state: Json
          called_at: string
          event_type: string
          game_id: string | null
          id: number
          prediction_id: string | null
          reason: string | null
          rpc_name: string | null
          slip_id: string | null
          user_id: string | null
        }
        Insert: {
          actor: string
          after_state: Json
          amount?: number | null
          before_state: Json
          called_at?: string
          event_type: string
          game_id?: string | null
          id?: number
          prediction_id?: string | null
          reason?: string | null
          rpc_name?: string | null
          slip_id?: string | null
          user_id?: string | null
        }
        Update: {
          actor?: string
          after_state?: Json
          amount?: number | null
          before_state?: Json
          called_at?: string
          event_type?: string
          game_id?: string | null
          id?: number
          prediction_id?: string | null
          reason?: string | null
          rpc_name?: string | null
          slip_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_audit_log_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "betman_games"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stadium_bricks: {
        Row: {
          brick_count: number
          created_at: string
          id: number
          points_spent: number
          start_index: number
          team_id: string
          user_id: string
        }
        Insert: {
          brick_count: number
          created_at?: string
          id?: never
          points_spent: number
          start_index: number
          team_id: string
          user_id: string
        }
        Update: {
          brick_count?: number
          created_at?: string
          id?: never
          points_spent?: number
          start_index?: number
          team_id?: string
          user_id?: string
        }
        Relationships: []
      }
      stadium_contributions: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string
          points_contributed: number
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string
          points_contributed?: number
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string
          points_contributed?: number
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stadium_contributions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      stadium_investments: {
        Row: {
          created_at: string
          id: string
          points_invested: number
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_invested: number
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points_invested?: number
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stadium_investments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      stadium_level_thresholds: {
        Row: {
          description: string | null
          level: number
          name_en: string
          name_ko: string
          required_points: number
          unlocked_features: Json
        }
        Insert: {
          description?: string | null
          level: number
          name_en: string
          name_ko: string
          required_points: number
          unlocked_features?: Json
        }
        Update: {
          description?: string | null
          level?: number
          name_en?: string
          name_ko?: string
          required_points?: number
          unlocked_features?: Json
        }
        Relationships: []
      }
      standings_cache: {
        Row: {
          created_at: string
          data: Json
          fetched_at: string
          league_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          fetched_at?: string
          league_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          fetched_at?: string
          league_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sticker_packs: {
        Row: {
          board_slug: string | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          board_slug?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          board_slug?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      sticker_votes: {
        Row: {
          created_at: string | null
          id: string
          sticker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sticker_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          sticker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_votes_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          approved_at: string | null
          board_slug: string | null
          created_at: string | null
          creator_cut: number | null
          creator_id: string
          id: string
          image_url: string
          media_type: string | null
          name: string
          pack_id: string | null
          price: number | null
          purchase_count: number | null
          rejected_at: string | null
          status: string | null
          tags: string[] | null
          use_count: number | null
          vote_count: number | null
          vote_threshold: number | null
        }
        Insert: {
          approved_at?: string | null
          board_slug?: string | null
          created_at?: string | null
          creator_cut?: number | null
          creator_id: string
          id?: string
          image_url: string
          media_type?: string | null
          name: string
          pack_id?: string | null
          price?: number | null
          purchase_count?: number | null
          rejected_at?: string | null
          status?: string | null
          tags?: string[] | null
          use_count?: number | null
          vote_count?: number | null
          vote_threshold?: number | null
        }
        Update: {
          approved_at?: string | null
          board_slug?: string | null
          created_at?: string | null
          creator_cut?: number | null
          creator_id?: string
          id?: string
          image_url?: string
          media_type?: string | null
          name?: string
          pack_id?: string | null
          price?: number | null
          purchase_count?: number | null
          rejected_at?: string | null
          status?: string | null
          tags?: string[] | null
          use_count?: number | null
          vote_count?: number | null
          vote_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_aliases: {
        Row: {
          alias: string
          created_at: string | null
          id: string
          source: string
          team_id: string | null
        }
        Insert: {
          alias: string
          created_at?: string | null
          id?: string
          source?: string
          team_id?: string | null
        }
        Update: {
          alias?: string
          created_at?: string | null
          id?: string
          source?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_dictionary: {
        Row: {
          aliases_kr: string[]
          created_at: string
          free_api_team_id: string | null
          lfa_team_id: string | null
          name_en: string
          name_kr: string | null
          note: string | null
          short_kr: string | null
          slug: string
          soccerway_team_id: string
          source: string
          status: string
          team_map_pin_id: string | null
          updated_at: string
        }
        Insert: {
          aliases_kr?: string[]
          created_at?: string
          free_api_team_id?: string | null
          lfa_team_id?: string | null
          name_en: string
          name_kr?: string | null
          note?: string | null
          short_kr?: string | null
          slug: string
          soccerway_team_id: string
          source?: string
          status?: string
          team_map_pin_id?: string | null
          updated_at?: string
        }
        Update: {
          aliases_kr?: string[]
          created_at?: string
          free_api_team_id?: string | null
          lfa_team_id?: string | null
          name_en?: string
          name_kr?: string | null
          note?: string | null
          short_kr?: string | null
          slug?: string
          soccerway_team_id?: string
          source?: string
          status?: string
          team_map_pin_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_map_pins: {
        Row: {
          city: string
          color: string | null
          country: string
          created_at: string
          is_active: boolean
          league_id: string
          pin_x: number
          pin_y: number
          sport: string
          stadium_name: string | null
          team_id: string
          team_name: string
          team_short_name: string
        }
        Insert: {
          city: string
          color?: string | null
          country?: string
          created_at?: string
          is_active?: boolean
          league_id: string
          pin_x: number
          pin_y: number
          sport: string
          stadium_name?: string | null
          team_id: string
          team_name: string
          team_short_name: string
        }
        Update: {
          city?: string
          color?: string | null
          country?: string
          created_at?: string
          is_active?: boolean
          league_id?: string
          pin_x?: number
          pin_y?: number
          sport?: string
          stadium_name?: string | null
          team_id?: string
          team_name?: string
          team_short_name?: string
        }
        Relationships: []
      }
      team_squads: {
        Row: {
          created_at: string
          jersey_number: number | null
          name_en: string
          name_kr: string | null
          name_kr_draft: string | null
          note: string | null
          player_id: string
          player_slug: string
          position: string | null
          soccerway_team_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          jersey_number?: number | null
          name_en: string
          name_kr?: string | null
          name_kr_draft?: string | null
          note?: string | null
          player_id: string
          player_slug: string
          position?: string | null
          soccerway_team_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          jersey_number?: number | null
          name_en?: string
          name_kr?: string | null
          name_kr_draft?: string | null
          note?: string | null
          player_id?: string
          player_slug?: string
          position?: string | null
          soccerway_team_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_squads_soccerway_team_id_fkey"
            columns: ["soccerway_team_id"]
            isOneToOne: false
            referencedRelation: "team_dictionary"
            referencedColumns: ["soccerway_team_id"]
          },
        ]
      }
      team_stadiums: {
        Row: {
          created_at: string
          fan_count: number
          id: string
          level: number
          team_id: string
          total_points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fan_count?: number
          id?: string
          level?: number
          team_id: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fan_count?: number
          id?: string
          level?: number
          team_id?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_stadiums_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "team_map_pins"
            referencedColumns: ["team_id"]
          },
        ]
      }
      teams: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          image_id: string | null
          is_active: boolean | null
          name: string
          name_ko: string | null
          sport_type: string
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id: string
          image_id?: string | null
          is_active?: boolean | null
          name: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          image_id?: string | null
          is_active?: boolean | null
          name?: string
          name_ko?: string | null
          sport_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      temperature_update_queue: {
        Row: {
          id: number
          post_id: string
          processed_at: string | null
          queued_at: string | null
        }
        Insert: {
          id?: number
          post_id: string
          processed_at?: string | null
          queued_at?: string | null
        }
        Update: {
          id?: number
          post_id?: string
          processed_at?: string | null
          queued_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temperature_update_queue_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "hot_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_update_queue_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticker_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          likes: number | null
          nickname: string
          ticker_item_id: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          likes?: number | null
          nickname: string
          ticker_item_id: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          likes?: number | null
          nickname?: string
          ticker_item_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticker_comments_ticker_item_id_fkey"
            columns: ["ticker_item_id"]
            isOneToOne: false
            referencedRelation: "news_ticker_items"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          id: string
          idempotency_key: string | null
          related_prediction_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          related_prediction_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          description?: string | null
          id?: string
          idempotency_key?: string | null
          related_prediction_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_acquisition: {
        Row: {
          created_at: string
          first_comment_at: string | null
          first_post_at: string | null
          first_seen_at: string | null
          first_slip_at: string | null
          landing_path: string | null
          referrer_host: string | null
          signup_at: string | null
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          first_comment_at?: string | null
          first_post_at?: string | null
          first_seen_at?: string | null
          first_slip_at?: string | null
          landing_path?: string | null
          referrer_host?: string | null
          signup_at?: string | null
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          first_comment_at?: string | null
          first_post_at?: string | null
          first_seen_at?: string | null
          first_slip_at?: string | null
          landing_path?: string | null
          referrer_host?: string | null
          signup_at?: string | null
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      user_adj_titles: {
        Row: {
          adj_title_id: string
          board_slug: string | null
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          adj_title_id: string
          board_slug?: string | null
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          adj_title_id?: string
          board_slug?: string | null
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_adj_titles_adj_title_id_fkey"
            columns: ["adj_title_id"]
            isOneToOne: false
            referencedRelation: "adj_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      user_board_points: {
        Row: {
          available_points: number
          board_slug: string
          created_at: string | null
          id: string
          level: number
          total_points: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_points?: number
          board_slug: string
          created_at?: string | null
          id?: string
          level?: number
          total_points?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_points?: number
          board_slug?: string
          created_at?: string | null
          id?: string
          level?: number
          total_points?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_cards: {
        Row: {
          card_type: string
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          reason: string
          report_id: string | null
          user_id: string
        }
        Insert: {
          card_type: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          reason: string
          report_id?: string | null
          user_id: string
        }
        Update: {
          card_type?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          reason?: string
          report_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cards_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "content_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      user_equipped_titles: {
        Row: {
          adj_title_id: string | null
          board_slug: string
          id: string
          noun_title_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          adj_title_id?: string | null
          board_slug: string
          id?: string
          noun_title_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          adj_title_id?: string | null
          board_slug?: string
          id?: string
          noun_title_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_equipped_titles_adj_title_id_fkey"
            columns: ["adj_title_id"]
            isOneToOne: false
            referencedRelation: "adj_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_equipped_titles_noun_title_id_fkey"
            columns: ["noun_title_id"]
            isOneToOne: false
            referencedRelation: "noun_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flair_prefs: {
        Row: {
          created_at: string
          flair_id: string
          pref: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flair_id: string
          pref: string
          user_id: string
        }
        Update: {
          created_at?: string
          flair_id?: string
          pref?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flair_prefs_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "post_flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_flair_scores: {
        Row: {
          flair_id: string
          last_at: string
          score_balance: number
          score_total: number
          user_id: string
        }
        Insert: {
          flair_id: string
          last_at?: string
          score_balance?: number
          score_total?: number
          user_id: string
        }
        Update: {
          flair_id?: string
          last_at?: string
          score_balance?: number
          score_total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_flair_scores_flair_id_fkey"
            columns: ["flair_id"]
            isOneToOne: false
            referencedRelation: "post_flairs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string | null
          followed_user_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          followed_user_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          followed_user_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: []
      }
      user_gold: {
        Row: {
          created_at: string | null
          gold_balance: number
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          gold_balance?: number
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          gold_balance?: number
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_gold_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_noun_titles: {
        Row: {
          id: string
          noun_title_id: string
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          noun_title_id: string
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          noun_title_id?: string
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_noun_titles_noun_title_id_fkey"
            columns: ["noun_title_id"]
            isOneToOne: false
            referencedRelation: "noun_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pixel_arts: {
        Row: {
          id: string
          pixel_art_id: string
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          pixel_art_id: string
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          pixel_art_id?: string
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pixel_arts_pixel_art_id_fkey"
            columns: ["pixel_art_id"]
            isOneToOne: false
            referencedRelation: "pixel_art_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prediction_stats: {
        Row: {
          badges: Json | null
          best_win_streak: number | null
          correct_predictions: number | null
          created_at: string | null
          current_streak: number | null
          experience_points: number | null
          highest_points: number | null
          id: string
          last_prediction_at: string | null
          level: number | null
          pending_predictions: number | null
          points_lost: number | null
          points_won: number | null
          rank_monthly: number | null
          rank_overall: number | null
          rank_weekly: number | null
          total_points: number | null
          total_predictions: number | null
          updated_at: string | null
          user_id: string
          win_rate: number | null
          worst_lose_streak: number | null
          wrong_predictions: number | null
        }
        Insert: {
          badges?: Json | null
          best_win_streak?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          experience_points?: number | null
          highest_points?: number | null
          id?: string
          last_prediction_at?: string | null
          level?: number | null
          pending_predictions?: number | null
          points_lost?: number | null
          points_won?: number | null
          rank_monthly?: number | null
          rank_overall?: number | null
          rank_weekly?: number | null
          total_points?: number | null
          total_predictions?: number | null
          updated_at?: string | null
          user_id: string
          win_rate?: number | null
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Update: {
          badges?: Json | null
          best_win_streak?: number | null
          correct_predictions?: number | null
          created_at?: string | null
          current_streak?: number | null
          experience_points?: number | null
          highest_points?: number | null
          id?: string
          last_prediction_at?: string | null
          level?: number | null
          pending_predictions?: number | null
          points_lost?: number | null
          points_won?: number | null
          rank_monthly?: number | null
          rank_overall?: number | null
          rank_weekly?: number | null
          total_points?: number | null
          total_predictions?: number | null
          updated_at?: string | null
          user_id?: string
          win_rate?: number | null
          worst_lose_streak?: number | null
          wrong_predictions?: number | null
        }
        Relationships: []
      }
      user_sanctions: {
        Row: {
          created_at: string | null
          evidence: Json | null
          expires_at: string | null
          id: string
          issued_by: string
          lift_reason: string | null
          lifted_at: string | null
          lifted_by: string | null
          reason: string
          starts_at: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          issued_by: string
          lift_reason?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason: string
          starts_at?: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          evidence?: Json | null
          expires_at?: string | null
          id?: string
          issued_by?: string
          lift_reason?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string
          starts_at?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_season_stats: {
        Row: {
          correct_count: number | null
          created_at: string | null
          id: string
          points_earned: number | null
          predictions_count: number | null
          rank_in_season: number | null
          season_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          correct_count?: number | null
          created_at?: string | null
          id?: string
          points_earned?: number | null
          predictions_count?: number | null
          rank_in_season?: number | null
          season_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          correct_count?: number | null
          created_at?: string | null
          id?: string
          points_earned?: number | null
          predictions_count?: number | null
          rank_in_season?: number | null
          season_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_season_stats_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "prediction_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stickers: {
        Row: {
          id: string
          purchased_at: string | null
          sticker_id: string
          user_id: string
        }
        Insert: {
          id?: string
          purchased_at?: string | null
          sticker_id: string
          user_id: string
        }
        Update: {
          id?: string
          purchased_at?: string | null
          sticker_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stickers_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_suspensions: {
        Row: {
          created_at: string
          id: string
          reason: string
          suspended_at: string
          suspended_until: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          suspended_at?: string
          suspended_until?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          suspended_at?: string
          suspended_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          created_at: string | null
          id: string
          last_reset_at: string
          token_balance: number
          total_tokens_earned: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_reset_at?: string
          token_balance?: number
          total_tokens_earned?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_reset_at?: string
          token_balance?: number
          total_tokens_earned?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_unlocked_titles: {
        Row: {
          title_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          title_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          title_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unlocked_titles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "flair_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string | null
          id: string
          target_id: string
          target_type: string
          updated_at: string | null
          user_id: string
          vote_value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          target_id: string
          target_type: string
          updated_at?: string | null
          user_id: string
          vote_value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          target_id?: string
          target_type?: string
          updated_at?: string | null
          user_id?: string
          vote_value?: number
        }
        Relationships: []
      }
      weekly_analytics_reports: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string
          generation_duration_ms: number | null
          id: string
          period_end: string
          period_start: string
          report_data: Json
          summary: string | null
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string
          generation_duration_ms?: number | null
          id?: string
          period_end: string
          period_start: string
          report_data?: Json
          summary?: string | null
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string
          generation_duration_ms?: number | null
          id?: string
          period_end?: string
          period_start?: string
          report_data?: Json
          summary?: string | null
        }
        Relationships: []
      }
      worldcup_candidates: {
        Row: {
          battle_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          seed: number
          win_count: number
        }
        Insert: {
          battle_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          seed?: number
          win_count?: number
        }
        Update: {
          battle_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          seed?: number
          win_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "worldcup_candidates_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      worldcup_sessions: {
        Row: {
          battle_id: string
          bracket_size: number
          completed_at: string | null
          created_at: string
          current_round: number
          id: string
          user_id: string
          winner_id: string | null
        }
        Insert: {
          battle_id: string
          bracket_size: number
          completed_at?: string | null
          created_at?: string
          current_round?: number
          id?: string
          user_id: string
          winner_id?: string | null
        }
        Update: {
          battle_id?: string
          bracket_size?: number
          completed_at?: string | null
          created_at?: string
          current_round?: number
          id?: string
          user_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worldcup_sessions_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "battle_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worldcup_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "worldcup_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      worldcup_votes: {
        Row: {
          candidate_a_id: string
          candidate_b_id: string
          created_at: string
          id: string
          match_index: number
          round: number
          session_id: string
          winner_id: string
        }
        Insert: {
          candidate_a_id: string
          candidate_b_id: string
          created_at?: string
          id?: string
          match_index: number
          round: number
          session_id: string
          winner_id: string
        }
        Update: {
          candidate_a_id?: string
          candidate_b_id?: string
          created_at?: string
          id?: string
          match_index?: number
          round?: number
          session_id?: string
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worldcup_votes_candidate_a_id_fkey"
            columns: ["candidate_a_id"]
            isOneToOne: false
            referencedRelation: "worldcup_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worldcup_votes_candidate_b_id_fkey"
            columns: ["candidate_b_id"]
            isOneToOne: false
            referencedRelation: "worldcup_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worldcup_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "worldcup_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worldcup_votes_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "worldcup_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      api_daily_usage: {
        Row: {
          day_kst: string | null
          lfa_calls: number | null
          lfa_credits: number | null
          lfa_credits_left: number | null
          llm_calls: number | null
          llm_fail_calls: number | null
          llm_input_tokens: number | null
          llm_output_tokens: number | null
          llm_usd: number | null
        }
        Relationships: []
      }
      hot_feed: {
        Row: {
          category_id: string | null
          comment_count: number | null
          community_slug: string | null
          content: Json | null
          created_at: string | null
          id: string | null
          image: string | null
          scoring_version: string | null
          temp_score_updated_at: string | null
          temperature: number | null
          title: string | null
          user_id: string | null
          view_count: number | null
          view_count_unique: number | null
          vote_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      news_reservoir_queue_lengths: {
        Row: {
          count: number | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      write_lfa_day_snapshot: {
        Args: { p_date: string; p_payload: Json; p_updated_at: string }
        Returns: boolean
      }
      write_lfa_match_snapshot: {
        Args: { p_game_ids: string[]; p_match_id: string; p_payload: Json; p_updated_at: string }
        Returns: Json
      }
      admin_adjust_gold: {
        Args: { p_amount: number; p_description: string; p_user_id: string }
        Returns: Json
      }
      admin_adjust_tokens: {
        Args: { p_amount: number; p_description: string; p_user_id: string }
        Returns: Json
      }
      api_cost_summary: { Args: never; Returns: Json }
      apply_flair_score: {
        Args: { p_delta: number; p_flair_id: string; p_user_id: string }
        Returns: undefined
      }
      assign_daily_round: {
        Args: { p_daily_id: string; p_daily_round_id: string }
        Returns: undefined
      }
      award_points: {
        Args: {
          p_amount: number
          p_board_slug: string
          p_description?: string
          p_related_id?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      betman_check_sync_health: { Args: never; Returns: Json }
      betman_update_sync_state: {
        Args: { new_gm_ts: string }
        Returns: undefined
      }
      buy_stadium_bricks: {
        Args: { p_brick_count: number; p_flair_id: string; p_user_id: string }
        Returns: Json
      }
      calc_streaks: {
        Args: { p_sport?: string; p_user_id: string }
        Returns: {
          best_win: number
          current_streak: number
          worst_lose: number
        }[]
      }
      calculate_post_temperature: {
        Args: { p_post_id: string }
        Returns: number
      }
      can_increment_view_count: {
        Args: { ip_address_param: string; post_id_param: string }
        Returns: boolean
      }
      can_post_comment: { Args: { user_id_param: string }; Returns: boolean }
      check_achievements: { Args: { p_user_id: string }; Returns: Json }
      cleanup_expired_ticker_comments: { Args: never; Returns: number }
      cleanup_old_ticker_items: { Args: never; Returns: number }
      cleanup_temperature_queue: {
        Args: { days_old?: number }
        Returns: number
      }
      compute_daily_id: { Args: { match_time: string }; Returns: string }
      deduct_board_points: {
        Args: { p_amount: number; p_board_slug: string; p_user_id: string }
        Returns: Json
      }
      donate_flair_score_to_team: {
        Args: { p_amount: number; p_flair_id: string; p_user_id: string }
        Returns: Json
      }
      draft_pick_stats: { Args: { p_slug: string }; Returns: Json }
      enqueue_temperature_update: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      ensure_daily_token_reset: {
        Args: { target_user_id: string }
        Returns: number
      }
      escrow_hold_gold:
        | { Args: { p_order_id: string }; Returns: Json }
        | {
            Args: { p_amount: number; p_order_id: string; p_user_id: string }
            Returns: Json
          }
      escrow_refund_gold:
        | { Args: { p_order_id: string }; Returns: Json }
        | {
            Args: { p_order_id: string; p_refund_percent?: number }
            Returns: Json
          }
      escrow_release_gold: { Args: { p_order_id: string }; Returns: Json }
      expire_stale_pending_predictions: {
        Args: never
        Returns: {
          expired_count: number
          refunded_count: number
        }[]
      }
      generate_order_number: { Args: never; Returns: string }
      get_league_id_by_alias: {
        Args: { p_alias: string; p_source?: string }
        Returns: string
      }
      get_level_for_points: {
        Args: { p_total_points: number }
        Returns: number
      }
      get_minigame_daily_leaderboard: {
        Args: { p_game: string; p_limit?: number }
        Returns: {
          best_score: number
          nickname: string
          plays: number
          user_id: string
        }[]
      }
      get_recent_commented_posts: {
        Args: { p_community_slug?: string; p_limit?: number }
        Returns: Json
      }
      get_team_id_by_alias: {
        Args: { p_alias: string; p_source?: string }
        Returns: string
      }
      get_token_reset_date: { Args: { check_time: string }; Returns: string }
      get_user_vote: {
        Args: { p_target_id: string; p_target_type: string; p_user_id: string }
        Returns: number
      }
      import_betman_round: {
        Args: { data: Json }
        Returns: {
          games_imported: number
          round_id: string
        }[]
      }
      increment_battle_participants: {
        Args: { p_battle_id: string }
        Returns: undefined
      }
      increment_battle_side_score: {
        Args: { p_side_id: string }
        Returns: undefined
      }
      increment_post_comment_count: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      increment_post_view_count: {
        Args: {
          ip_address_param: string
          post_id_param: string
          user_id_param?: string
        }
        Returns: boolean
      }
      increment_prediction_count: {
        Args: { match_id_param: string }
        Returns: undefined
      }
      increment_sticker_use: {
        Args: { p_sticker_id: string }
        Returns: undefined
      }
      increment_worldcup_win: {
        Args: { p_candidate_id: string }
        Returns: undefined
      }
      invest_stadium_points: {
        Args: { p_amount: number; p_team_id: string; p_user_id: string }
        Returns: Json
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_bookmarked: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      is_content_purchased: {
        Args: { p_prediction_id: string; p_user_id: string }
        Returns: boolean
      }
      is_moderator_or_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_subscription_active: {
        Args: { p_expert_id: string; p_subscriber_id: string }
        Returns: boolean
      }
      metaverse_award_flair_karma: {
        Args: {
          p_delta: number
          p_source?: string
          p_team_id: string
          p_user_id: string
        }
        Returns: Json
      }
      metaverse_cleanup_empty_chat_rooms: { Args: never; Returns: number }
      metaverse_create_chat_room: {
        Args: {
          p_cost?: number
          p_plot_id: string
          p_sign_text: string
          p_user_id: string
        }
        Returns: Json
      }
      metaverse_equip_avatar: {
        Args: { p_avatar_key: string; p_user_id: string }
        Returns: Json
      }
      metaverse_purchase_avatar: {
        Args: { p_avatar_key: string; p_user_id: string }
        Returns: Json
      }
      metaverse_spend_activity_points: {
        Args: { p_amount: number; p_purpose?: string; p_user_id: string }
        Returns: Json
      }
      process_temperature_queue: {
        Args: { batch_size?: number }
        Returns: number
      }
      purchase_noun_title: {
        Args: { p_noun_title_id: string; p_user_id: string }
        Returns: Json
      }
      purchase_sticker: {
        Args: { p_board_slug?: string; p_sticker_id: string; p_user_id: string }
        Returns: Json
      }
      recalc_all_user_temperatures: { Args: never; Returns: number }
      recalc_user_sport_stats: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      recalculate_all_comment_counts: { Args: never; Returns: undefined }
      recalculate_post_comment_count: {
        Args: { post_id_param: string }
        Returns: number
      }
      record_funnel_milestone: {
        Args: { p_step: string; p_user_id: string }
        Returns: boolean
      }
      record_news_candidate_events: {
        Args: { p_events: Json }
        Returns: number
      }
      record_unique_view: {
        Args: { p_post_id: string; p_user_id: string }
        Returns: boolean
      }
      refresh_hot_feed: { Args: never; Returns: undefined }
      refund_tokens: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: {
          new_balance: number
          success: boolean
        }[]
      }
      reset_expired_temperatures:
        | { Args: never; Returns: number }
        | { Args: { days_old?: number }; Returns: number }
      reset_user_daily_tokens: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      reward_gold: {
        Args: {
          p_amount: number
          p_description?: string
          p_transaction_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      season_event_points: {
        Args: { p_event_slug: string; p_user_id?: string }
        Returns: {
          comment_points: number
          community_actions: number
          post_points: number
          prediction_points: number
          total_points: number
          user_id: string
          vote_points: number
        }[]
      }
      season_event_slip_count: {
        Args: { p_event_slug: string }
        Returns: number
      }
      season_event_slips: {
        Args: { p_event_slug: string }
        Returns: {
          group_slug: string
          stake: number
          status: string
          total_odds: number
          user_id: string
        }[]
      }
      season_event_slips_range: {
        Args: { p_event_slug: string; p_from?: string; p_to?: string }
        Returns: {
          group_slug: string
          stake: number
          status: string
          total_odds: number
          user_id: string
        }[]
      }
      spend_gold: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: Json
      }
      spend_tokens: {
        Args: {
          p_amount: number
          p_description?: string
          p_related_prediction_id?: string
          p_transaction_type?: string
          p_user_id: string
        }
        Returns: {
          error_message: string
          remaining_balance: number
          success: boolean
        }[]
      }
      stadium_bricks_today: {
        Args: never
        Returns: {
          bricks: number
          team_id: string
        }[]
      }
      sync_live_room_status: { Args: never; Returns: undefined }
      sync_stadium_contribution: {
        Args: { p_new_points: number; p_team_id: string; p_user_id: string }
        Returns: Json
      }
      update_active_post_temperatures: { Args: never; Returns: number }
      update_active_rounds: { Args: never; Returns: undefined }
      update_comment_cooldown: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      update_stadium_fan_counts: { Args: never; Returns: undefined }
      update_temperature_score: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      update_user_temperature: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      vote_sticker: {
        Args: { p_sticker_id: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

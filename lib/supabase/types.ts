export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          points_earned: number | null
          prediction: string
          round_id: string | null
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_round_id?: string | null
          game_id: string
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          prediction: string
          round_id?: string | null
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_round_id?: string | null
          game_id?: string
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          prediction?: string
          round_id?: string | null
          settled_at?: string | null
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
      betman_sync_state: {
        Row: {
          active_rounds: string[]
          created_at: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
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
          last_sync_action?: string | null
          last_sync_games_count?: number | null
          latest_gm_ts?: string
          updated_at?: string | null
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
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
      comments: {
        Row: {
          content: string
          created_at: string | null
          deleted_at: string | null
          depth: number | null
          id: string
          parent_id: string | null
          path: string[] | null
          post_id: string
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
          parent_id?: string | null
          path?: string[] | null
          post_id: string
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
          parent_id?: string | null
          path?: string[] | null
          post_id?: string
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
        ]
      }
      commission_escrow: {
        Row: {
          action: string
          amount: number
          created_at: string | null
          from_user_id: string | null
          id: string
          note: string | null
          order_id: string
          to_user_id: string | null
        }
        Insert: {
          action: string
          amount: number
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_user_id?: string | null
        }
        Update: {
          action?: string
          amount?: number
          created_at?: string | null
          from_user_id?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_escrow_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "commission_orders"
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
      gold_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          id: string
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
      movie_quiz_results: {
        Row: {
          created_at: string | null
          id: string
          is_correct: boolean
          points_earned: number
          quiz_id: string
          selected_answer: number
          time_taken_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_correct: boolean
          points_earned?: number
          quiz_id: string
          selected_answer: number
          time_taken_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_correct?: boolean
          points_earned?: number
          quiz_id?: string
          selected_answer?: number
          time_taken_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movie_quiz_results_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "movie_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      movie_quizzes: {
        Row: {
          category: string
          choices: Json
          correct_answer: number
          created_at: string | null
          difficulty: string
          explanation: string | null
          id: string
          image_url: string | null
          is_active: boolean
          movie_title: string | null
          movie_year: number | null
          points: number
          question: string
        }
        Insert: {
          category: string
          choices?: Json
          correct_answer: number
          created_at?: string | null
          difficulty?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          movie_title?: string | null
          movie_year?: number | null
          points?: number
          question: string
        }
        Update: {
          category?: string
          choices?: Json
          correct_answer?: number
          created_at?: string | null
          difficulty?: string
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          movie_title?: string | null
          movie_year?: number | null
          points?: number
          question?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
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
      post_views: {
        Row: {
          created_at: string | null
          id: string
          ip_hash: string
          post_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_hash: string
          post_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_hash?: string
          post_id?: string
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
          id: string
          image: string | null
          is_notice: boolean | null
          scoring_version: string | null
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
          id?: string
          image?: string | null
          is_notice?: boolean | null
          scoring_version?: string | null
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
          id?: string
          image?: string | null
          is_notice?: boolean | null
          scoring_version?: string | null
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
          commission_status: string
          created_at: string | null
          id: string
          is_artist: boolean
          nickname: string
          role: string | null
          specialties: string[] | null
          temperature: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artist_bio?: string | null
          avatar_url?: string | null
          commission_status?: string
          created_at?: string | null
          id?: string
          is_artist?: boolean
          nickname: string
          role?: string | null
          specialties?: string[] | null
          temperature?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artist_bio?: string | null
          avatar_url?: string | null
          commission_status?: string
          created_at?: string | null
          id?: string
          is_artist?: boolean
          nickname?: string
          role?: string | null
          specialties?: string[] | null
          temperature?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      subscriptions: {
        Row: {
          amount_paid: number
          created_at: string | null
          expert_id: string
          expires_at: string | null
          id: string
          started_at: string
          status: string
          subscriber_id: string
          subscription_type: string
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string | null
          expert_id: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          subscriber_id: string
          subscription_type: string
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          expert_id?: string
          expires_at?: string | null
          id?: string
          started_at?: string
          status?: string
          subscriber_id?: string
          subscription_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_expert_id_fkey"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
      token_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          id: string
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
      virtual_casting_suggestions: {
        Row: {
          actor_name: string
          casting_id: string
          created_at: string | null
          id: string
          reason: string | null
          user_id: string
          vote_count: number
        }
        Insert: {
          actor_name: string
          casting_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
          user_id: string
          vote_count?: number
        }
        Update: {
          actor_name?: string
          casting_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
          user_id?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "virtual_casting_suggestions_casting_id_fkey"
            columns: ["casting_id"]
            isOneToOne: false
            referencedRelation: "virtual_castings"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_casting_votes: {
        Row: {
          created_at: string | null
          id: string
          suggestion_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          suggestion_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          suggestion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_casting_votes_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "virtual_casting_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_castings: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          image_url: string | null
          is_active: boolean
          movie_title: string
          original_actor: string | null
          role_description: string | null
          role_name: string
          suggestion_count: number
          updated_at: string | null
          vote_count: number
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          movie_title: string
          original_actor?: string | null
          role_description?: string | null
          role_name: string
          suggestion_count?: number
          updated_at?: string | null
          vote_count?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          movie_title?: string
          original_actor?: string | null
          role_description?: string | null
          role_name?: string
          suggestion_count?: number
          updated_at?: string | null
          vote_count?: number
        }
        Relationships: []
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
    }
    Views: {
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
    }
    Functions: {
      assign_daily_round: {
        Args: { p_daily_id: string; p_daily_round_id: string }
        Returns: undefined
      }
      betman_check_sync_health: { Args: never; Returns: Json }
      betman_update_sync_state: {
        Args: { new_gm_ts: string }
        Returns: undefined
      }
      calc_streaks: {
        Args: { p_sport?: string; p_user_id: string }
        Returns: {
          best_win: number
          current_streak: number
          worst_lose: number
        }[]
      }
      can_increment_view_count: {
        Args: { ip_address_param: string; post_id_param: string }
        Returns: boolean
      }
      can_post_comment: { Args: { user_id_param: string }; Returns: boolean }
      cleanup_temperature_queue: {
        Args: { days_old?: number }
        Returns: number
      }
      compute_daily_id: { Args: { match_time: string }; Returns: string }
      enqueue_temperature_update: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      ensure_daily_token_reset: {
        Args: { target_user_id: string }
        Returns: number
      }
      escrow_hold_gold: {
        Args: { p_amount: number; p_order_id: string; p_user_id: string }
        Returns: Json
      }
      escrow_refund_gold: {
        Args: { p_order_id: string; p_refund_percent?: number }
        Returns: Json
      }
      escrow_release_gold: { Args: { p_order_id: string }; Returns: Json }
      generate_order_number: { Args: never; Returns: string }
      get_league_id_by_alias: {
        Args: { p_alias: string; p_source?: string }
        Returns: string
      }
      get_team_id_by_alias: {
        Args: { p_alias: string; p_source?: string }
        Returns: string
      }
      get_token_reset_date: { Args: { check_time?: string }; Returns: string }
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
      increment_post_comment_count: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      increment_post_view_count: {
        Args: { ip_address_param: string; post_id_param: string }
        Returns: boolean
      }
      increment_prediction_count: {
        Args: { match_id_param: string }
        Returns: undefined
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
      process_temperature_queue: {
        Args: { batch_size?: number }
        Returns: number
      }
      recalc_user_sport_stats: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      recalculate_all_comment_counts: { Args: never; Returns: undefined }
      recalculate_post_comment_count: {
        Args: { post_id_param: string }
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
      reset_expired_temperatures: { Args: never; Returns: number }
      reset_user_daily_tokens: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      settle_betman_game: {
        Args: { p_away_score: number; p_game_id: string; p_home_score: number }
        Returns: number
      }
      settle_round: { Args: { p_gm_ts: string }; Returns: Json }
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
          new_balance: number
          success: boolean
        }[]
      }
      update_comment_cooldown: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      update_temperature_score: {
        Args: { p_post_id: string }
        Returns: undefined
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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

// Custom types for escrow RPC results
export interface EscrowHoldResult {
  success: boolean
  error_message?: string | null
  new_balance?: number
}

export interface EscrowReleaseResult {
  success: boolean
  error_message?: string | null
  artist_received?: number
  fee?: number
}

export interface EscrowRefundResult {
  success: boolean
  error_message?: string | null
  refunded?: number
  artist_received?: number
}

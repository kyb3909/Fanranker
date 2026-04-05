# FanRanker Community Project

## Supabase 연결 정보
- **프로젝트**: FanRanker (community)
- **Supabase URL**: `ekysrlhdrapmsnrkytif.supabase.co`
- **MCP 연결**: supabase MCP는 위 프로젝트에 연결되어 있음

> 세션 시작 시 반드시 사용자에게 알려줄 것:
> "현재 Supabase MCP는 **FanRanker (ekysrlhdrapmsnrkytif)** 프로젝트에 연결되어 있습니다."

## Git 규칙
- git push 금지. 사용자가 직접 push함. 커밋까지만 수행할 것.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

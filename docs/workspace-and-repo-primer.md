Workspace & Repository Setup Primer
Project: Scarlett & Benjamin – Guardian Agent MCP
Purpose: Guide for setting up a clean, separate workspace for the new Guardian Agent while working alongside an existing RAG setup.
Audience: GPT-5.5 / Coding Assistant
User Context: Working alone in Cursor IDE / WPS. Has an existing RAG + vector database setup. Wants to avoid confusion between projects.
1. Current Situation

There is an existing RAG project (vector database, indexing scripts, retrieval logic, and the grok-rag-mcp connector).
We are now creating a new, separate project called the Guardian Agent.
The Guardian will eventually talk to the same vector database as the existing RAG, but it should live in its own repository and folder structure.
The user wants to keep things simple and avoid mixing code between the two projects during early development.

2. Core Principle
Keep the Guardian in its own repository and workspace.
Reason: The Guardian has a different responsibility (orchestration + compliance + report generation) compared to the RAG (data storage + retrieval). Mixing them early usually creates confusion and technical debt.
3. Recommended Repository Structure
Main Recommendation
Create one new GitHub repository with the following suggested name:

scarlett-guardian-mcp
guardian-agent
sb-guardian-mcp

Do NOT put the Guardian code inside the existing RAG repository.
Local Folder Structure (Recommended)
On your machine, organize it like this:
text~/Projects/
├── scarlett-rag/                  ← Your existing RAG project (leave mostly untouched)
│   └── ...
│
└── scarlett-guardian-mcp/         ← NEW project (this is what we're building now)
    ├── .git/
    ├── src/
    │   ├── guardian/
    │   │   ├── __init__.py
    │   │   ├── server.py              # Main MCP server entrypoint
    │   │   ├── tools/
    │   │   │   └── preflight.py
    │   │   └── report/
    │   │       └── models.py          # Pydantic models for the report
    │   └── shared/                    # (Optional) code you might want to share later
    ├── tests/
    ├── pyproject.toml
    ├── README.md
    └── .env.example
This structure keeps the Guardian clean and focused.
4. How the Two Projects Should Interact (During Development)

The Guardian should be able to read from the same vector database as your existing RAG.
In the beginning, prefer connecting directly to the vector database rather than importing large amounts of code from the RAG project.
If you later want to share utility functions, you can either:
Copy small functions into the Guardian repo, or
Create a small shared Python package later (not recommended in Phase 1).


Rule of thumb for now: Treat the existing RAG as a black box data source. Connect to it via environment variables or config, but don’t deeply couple the codebases yet.
5. Development Workspace Setup in Cursor
Recommended way to work:

Open two separate Cursor windows:
One for scarlett-rag
One for scarlett-guardian-mcp

Or use Cursor Workspaces (multi-root) if you prefer everything in one window:
Add both folders as roots, but keep them clearly separated in the file explorer.

Use different terminal profiles or clearly named terminal tabs so you don’t accidentally run commands in the wrong project.

6. Environment & Configuration

Use a .env file inside the Guardian project for:
Vector database connection settings
Any API keys needed
Debug flags

Do not commit real credentials. Use .env.example.
Keep the Guardian’s configuration simple at the start.

7. Best Practices to Avoid Confusion

Always check which folder/terminal you’re in before running commands.
Name your terminals clearly (e.g., guardian-dev, rag-dev).
Start with a very minimal Guardian structure. Don’t over-engineer the folder layout on day one.
Keep the Guardian’s README.md updated with how to run it locally.
When in doubt, ask: “Would this code belong in a retrieval system or in an agent that makes decisions about retrieval?”

8. Suggested First Steps (for GPT-5.5)
When helping the user set this up, please:

Confirm the repository name and create a basic README.md.
Suggest a minimal but clean Python project structure (using pyproject.toml is preferred).
Help set up a basic MCP server skeleton that can later expose the guardian_memory_preflight tool.
Show how to connect to the existing vector database without tightly coupling the code.
Create a simple .env.example file.
Suggest how to test the Guardian locally before connecting it to Grok.


End of Primer
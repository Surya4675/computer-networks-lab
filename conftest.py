import os
import sys

# Make the repository root importable so tests can `import app` / `import executor`.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

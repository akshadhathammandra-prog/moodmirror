import os
import glob

output_file = "PROJECT_SOURCE_CODE_COMBINED.md"

backend_files = [
    "backend/app.py",
    "backend/audio_predict.py",
    "backend/text_predict.py",
    "backend/db.py",
    "backend/tasks.py",
    "backend/celery_worker.py",
    "backend/Dockerfile",
    "docker-compose.yml",
    "backend/requirements.txt",
    "backend/.env.example"
]

frontend_files = [
    "frontend/html_frontend/src/main.jsx",
    "frontend/html_frontend/src/App.jsx",
    "frontend/html_frontend/src/index.css",
    "frontend/html_frontend/tailwind.config.js"
]

def append_file(path, out):
    # Fix paths for windows if necessary, but forward slash works in Python
    path_normalized = os.path.normpath(path)
    
    # Try alternative paths if requested file is missing
    if not os.path.exists(path_normalized):
        if "docker-compose.yml" in path_normalized:
            path_normalized = "docker-compose.yml"
        else:
            return
            
    if not os.path.exists(path_normalized) or os.path.isdir(path_normalized):
        return
        
    try:
        with open(path_normalized, 'r', encoding='utf-8') as f:
            content = f.read()
            
        out.write("==================================================\n")
        path_formatted = path.replace('\\', '/')
        out.write(f"FILE: {path_formatted}\n")
        out.write("===========================\n\n")
        out.write(content)
        if not content.endswith('\n'):
            out.write('\n')
        out.write('\n')
    except Exception as e:
        print(f"Failed to read {path_normalized}: {e}")

with open(output_file, 'w', encoding='utf-8') as out:
    for f in backend_files:
        append_file(f, out)
    for f in frontend_files:
        append_file(f, out)
        
    pages = glob.glob("frontend/html_frontend/src/pages/*.*")
    for f in sorted(pages):
        # convert back to forward slashes for output consistency
        f = f.replace("\\", "/")
        append_file(f, out)
        
    components = glob.glob("frontend/html_frontend/src/components/*.*")
    for f in sorted(components):
        f = f.replace("\\", "/")
        append_file(f, out)

print("Generated " + output_file)

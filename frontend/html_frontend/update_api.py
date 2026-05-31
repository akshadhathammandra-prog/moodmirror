import os

frontend_dir = r"d:\depression_react\depression_react\frontend\html_frontend\src"

for root, _, files in os.walk(frontend_dir):
    for file in files:
        if file.endswith((".jsx", ".js")):
            filepath = os.path.join(root, file)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            if "http://127.0.0.1:5000" in content:
                new_content = content.replace("http://127.0.0.1:5000", "http://140.245.251.56")
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated {filepath}")

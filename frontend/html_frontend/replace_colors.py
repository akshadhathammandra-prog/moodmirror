import os

mappings = {
    '#2f3e5c': '#0A3323',
    '#a8c3b0': '#839958',
    '#f2a7a7': '#D3968C',
    '#9fb7d4': '#105666',
    '#f2e3b6': '#F7F4D5',
    '#1e2a40': '#105666',
    '#f7f7f5': '#F7F4D5'
}

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.jsx', '.js', '.css', '.html')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            original_content = content
            for old, new in mappings.items():
                content = content.replace(old, new)
            if content != original_content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated {path}")

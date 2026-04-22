#!/usr/bin/env python3
"""Feature Flag CLI for AI Energy Monitor — python flags.py"""

import json, os, re, sys, textwrap
from datetime import date

EXTENSION_DIR = os.path.join(os.path.dirname(__file__), 'extension')
FLAGS_FILE    = os.path.join(EXTENSION_DIR, 'flags.json')

C_RESET  = '\033[0m'
C_RED    = '\033[91m'
C_GREEN  = '\033[92m'
C_YELLOW = '\033[93m'
C_CYAN   = '\033[96m'
C_BOLD   = '\033[1m'

STATUS_DISPLAY = {
    'dev':    f'{C_YELLOW} DEV  {C_RESET}',
    'stable': f'{C_CYAN}STABLE{C_RESET}',
    'prod':   f'{C_GREEN} PROD {C_RESET}',
}

# ── I/O ───────────────────────────────────────────────────────────────────────

def load():
    with open(FLAGS_FILE, encoding='utf-8') as f:
        return json.load(f)

def save(data):
    with open(FLAGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

def read_file(rel_path):
    with open(os.path.join(EXTENSION_DIR, rel_path), encoding='utf-8') as f:
        return f.readlines()

def write_file(rel_path, lines):
    with open(os.path.join(EXTENSION_DIR, rel_path), 'w', encoding='utf-8') as f:
        f.writelines(lines)

# ── Display ───────────────────────────────────────────────────────────────────

def show_table(data):
    flags = data['flags']
    print()
    print(f'  {C_BOLD}Feature Flags — AI Energy Monitor{C_RESET}')
    print('  ' + '─' * 70)
    print(f"  {'#':<4} {'STATUS':<14} {'ADDED':<13} {'ID':<24} BESCHREIBUNG")
    print('  ' + '─' * 70)
    for i, f in enumerate(flags, 1):
        status  = STATUS_DISPLAY.get(f['status'], f['status'])
        desc    = textwrap.shorten(f.get('description', ''), 22)
        print(f"  [{i:<2}] {status}   {f['added']:<13} {f['id']:<24} {desc}")
    print()

def show_detail(f):
    print()
    print(f"  {C_BOLD}{f['id']}{C_RESET}  [{f['status']}]")
    print(f"  {'─' * 50}")
    print(f"  Hinzugefügt:  {f['added']}")
    print(f"  Beschreibung:")
    for line in textwrap.wrap(f.get('description', '—'), 58):
        print(f"    {line}")
    print(f"  Dateien:")
    for fp in f.get('files', []):
        print(f"    extension/{fp}")
    if f.get('notes'):
        print(f"  Notizen:")
        for line in textwrap.wrap(f['notes'], 58):
            print(f"    {line}")
    if f.get('promote_notes'):
        print(f"  {C_YELLOW}Manueller Schritt beim Promoten:{C_RESET}")
        for line in textwrap.wrap(f['promote_notes'], 58):
            print(f"    {line}")
    print()

# ── Promotion: code transformation ───────────────────────────────────────────

def promote_in_file(rel_path, flag_id):
    """Apply all @flag annotations for flag_id in one file.
    Returns (new_lines, num_changes).
    """
    try:
        lines = read_file(rel_path)
    except FileNotFoundError:
        print(f"  {C_YELLOW}WARNUNG:{C_RESET} Datei nicht gefunden: extension/{rel_path}")
        return [], 0

    new_lines = []
    changes   = 0
    i, n      = 0, len(lines)

    while i < n:
        stripped = lines[i].strip()

        # ── Pattern A ────────────────────────────────────────────────────────
        # // @flag <name>
        # if (!featureFlags.<name>) return;
        if stripped == f'// @flag {flag_id}' and i + 1 < n:
            nxt = lines[i + 1].strip()
            if nxt == f'if (!featureFlags.{flag_id}) return;':
                i += 2
                changes += 1
                continue

        # ── Pattern B ────────────────────────────────────────────────────────
        # // @flag <name>
        # if (featureFlags.<name>) { ... } else { ... }
        # // @flag:end
        if stripped == f'// @flag {flag_id}':
            end_idx = next(
                (j for j in range(i + 1, n) if lines[j].strip() == '// @flag:end'),
                None
            )
            if end_idx is not None:
                block      = lines[i + 1:end_idx]
                true_lines = extract_true_branch(block, flag_id)
                new_lines.extend(true_lines)
                i = end_idx + 1
                changes += 1
                continue

        # ── Pattern T (ternary) ───────────────────────────────────────────────
        # expr ? newVal : oldVal  // @flag:ternary <name>
        if f'// @flag:ternary {flag_id}' in lines[i]:
            new_line = promote_ternary(lines[i], flag_id)
            new_lines.append(new_line)
            i += 1
            changes += 1
            continue

        new_lines.append(lines[i])
        i += 1

    return new_lines, changes


def extract_true_branch(block_lines, flag_id):
    """Extract the true branch from an if/else block between @flag and @flag:end."""
    # Find the if (featureFlags.<flag_id>) line
    if_idx = next(
        (i for i, l in enumerate(block_lines)
         if f'featureFlags.{flag_id}' in l and 'if (' in l),
        None
    )
    if if_idx is None:
        return block_lines  # no if found — return unchanged

    if_line      = block_lines[if_idx]
    outer_indent = len(if_line) - len(if_line.lstrip())
    inner_indent = outer_indent + 2

    # Collect true-branch lines until depth returns to 0
    true_lines = []
    depth = 1
    i = if_idx + 1

    while i < len(block_lines) and depth > 0:
        raw     = block_lines[i].rstrip('\n')
        opens   = raw.count('{')
        closes  = raw.count('}')
        depth  += opens - closes

        if depth == 0:
            break  # closing } or } else {

        # Dedent by 2 (inner → outer)
        line = block_lines[i]
        if line.startswith(' ' * inner_indent):
            true_lines.append(' ' * outer_indent + line[inner_indent:])
        else:
            true_lines.append(line)
        i += 1

    return true_lines


def promote_ternary(line, flag_id):
    """Replace  featureFlags.X ? trueVal : falseVal  with  trueVal."""
    # Remove annotation comment
    result = re.sub(r'\s*//\s*@flag:ternary\s+\S+', '', line)
    # Match:  featureFlags.<name> ? <true> : <false>
    # We grab everything between ? and the last : before end-of-expression
    pattern = (
        r'featureFlags\.' + re.escape(flag_id) +
        r'\s*\?\s*(.+?)\s*:\s*\([^)]+\)'  # handles : (fallback)
    )
    m = re.search(pattern, result)
    if m:
        true_val = m.group(1).strip()
        full_pat = (
            r'featureFlags\.' + re.escape(flag_id) +
            r'\s*\?.*?:\s*\([^)]+\)'
        )
        result = re.sub(full_pat, true_val, result)
    return result


def show_diff(old_lines, new_lines, rel_path):
    import difflib
    diff = list(difflib.unified_diff(
        old_lines, new_lines,
        fromfile=f'a/{rel_path}',
        tofile=f'b/{rel_path}',
        lineterm=''
    ))
    if not diff:
        print(f"  (keine Änderungen in {rel_path})")
        return
    for line in diff[:80]:
        if line.startswith('+') and not line.startswith('+++'):
            print(f"  {C_GREEN}{line}{C_RESET}")
        elif line.startswith('-') and not line.startswith('---'):
            print(f"  {C_RED}{line}{C_RESET}")
        else:
            print(f"  {line}")


def promote_flag(data, idx):
    f = data['flags'][idx]
    if f['status'] == 'prod':
        print(f"\n  '{f['id']}' ist bereits production.\n")
        return

    print(f"\n  {C_BOLD}Promote '{f['id']}' → production{C_RESET}")
    print(f"  {'─' * 44}")

    file_changes = {}
    for rel_path in f.get('files', []):
        old_lines = []
        try:
            old_lines = read_file(rel_path)
        except FileNotFoundError:
            print(f"  {C_YELLOW}Datei nicht gefunden:{C_RESET} extension/{rel_path}")
            continue
        new_lines, changes = promote_in_file(rel_path, f['id'])
        if changes > 0:
            file_changes[rel_path] = (old_lines, new_lines, changes)
        else:
            print(f"  Keine @flag-Annotationen in extension/{rel_path}")

    if not file_changes:
        if f.get('promote_notes'):
            print(f"\n  {C_YELLOW}Manuell:{C_RESET} {f['promote_notes']}")
        print()
        return

    for rel_path, (old, new, n) in file_changes.items():
        print(f"\n  extension/{rel_path}  ({n} Änderung(en)):")
        show_diff(old, new, rel_path)

    print()
    confirm = input("  Änderungen anwenden? [j/n] ").strip().lower()
    if confirm == 'j':
        for rel_path, (_, new_lines, _) in file_changes.items():
            write_file(rel_path, new_lines)
        f['status'] = 'prod'
        save(data)
        print(f"\n  {C_GREEN}✓ '{f['id']}' promoted — flags.json aktualisiert{C_RESET}\n")
    else:
        print("  Abgebrochen.\n")

# ── Add / Edit ────────────────────────────────────────────────────────────────

def add_flag(data):
    print()
    flag_id = input("  ID (z.B. debugLogging): ").strip()
    if not flag_id:
        return
    desc    = input("  Beschreibung: ").strip()
    files_r = input("  Dateien (kommasepariert, z.B. content/universal.js): ").strip()
    files   = [fp.strip() for fp in files_r.split(',') if fp.strip()]
    notes   = input("  Promote-Hinweis (optional): ").strip()

    entry = {
        "id":          flag_id,
        "description": desc,
        "status":      "dev",
        "added":       str(date.today()),
        "files":       files
    }
    if notes:
        entry["promote_notes"] = notes

    data['flags'].append(entry)
    save(data)
    print(f"\n  {C_GREEN}✓ Flag '{flag_id}' hinzugefügt{C_RESET}\n")


def edit_flag(data, idx):
    f = data['flags'][idx]
    print(f"\n  Bearbeite: {C_BOLD}{f['id']}{C_RESET}  (Enter = unverändert)\n")

    desc = input(f"  Beschreibung [{textwrap.shorten(f.get('description',''), 45)}]: ").strip()
    if desc:
        f['description'] = desc

    notes = input(f"  Notizen [{f.get('notes', '')}]: ").strip()
    if notes:
        f['notes'] = notes

    promote_notes = input(f"  Promote-Hinweis [{f.get('promote_notes', '')}]: ").strip()
    if promote_notes:
        f['promote_notes'] = promote_notes

    save(data)
    print(f"\n  {C_GREEN}✓ '{f['id']}' aktualisiert{C_RESET}\n")

# ── Main ──────────────────────────────────────────────────────────────────────

def get_flag(data, idx):
    flags = data['flags']
    return flags[idx] if 0 <= idx < len(flags) else None


def main():
    if not os.path.exists(FLAGS_FILE):
        print(f"flags.json nicht gefunden: {FLAGS_FILE}")
        sys.exit(1)

    data = load()

    while True:
        show_table(data)
        print(f"  {C_BOLD}Aktionen:{C_RESET}  [nr] details   [a] add   [e <nr>] edit   [p <nr>] promote   [q] quit")
        action = input("  > ").strip()
        print()

        if action == 'q':
            break

        elif action == 'a':
            add_flag(data)
            data = load()

        elif action.isdigit():
            f = get_flag(data, int(action) - 1)
            if f:
                show_detail(f)
                input("  (Enter zum Fortfahren)")
                print()

        elif action.startswith('e '):
            parts = action.split()
            if len(parts) == 2 and parts[1].isdigit():
                f = get_flag(data, int(parts[1]) - 1)
                if f:
                    edit_flag(data, int(parts[1]) - 1)
                    data = load()

        elif action.startswith('p '):
            parts = action.split()
            if len(parts) == 2 and parts[1].isdigit():
                idx = int(parts[1]) - 1
                if get_flag(data, idx):
                    promote_flag(data, idx)
                    data = load()

        else:
            print("  Unbekannte Eingabe.\n")


if __name__ == '__main__':
    main()

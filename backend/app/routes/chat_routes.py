import os
import re
import logging
from datetime import datetime, timezone
from flask import request, jsonify, session
from . import api_bp
import anthropic

logger = logging.getLogger(__name__)

_CNP_RE  = re.compile(r'\b[1-8]\d{12}\b')
_EMAIL_RE = re.compile(r'\b[\w.+-]+@(?:[\w-]+\.)+[a-zA-Z]{2,}\b')
_PHONE_RE = re.compile(r'\b(?:\+40|0040|0)[\s.-]?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b')

def _sanitize_pii(text: str) -> tuple[str, list[str]]:
    tags = []
    if _CNP_RE.search(text):
        tags.append('[CNP]')
        text = _CNP_RE.sub('[CNP]', text)
    if _EMAIL_RE.search(text):
        tags.append('[EMAIL]')
        text = _EMAIL_RE.sub('[EMAIL]', text)
    if _PHONE_RE.search(text):
        tags.append('[TELEFON]')
        text = _PHONE_RE.sub('[TELEFON]', text)
    return text, tags

_FACULTY_BLOCKS = {
    'fsgc': """
## Contextul tău: FSGC (Facultatea de Științe Economice și Gestiunea Afacerilor)

### Foaia de răspuns FSGC
- **3 secțiuni** (stânga / mijloc / dreapta), **câte 15 întrebări** fiecare → total **45 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- Marcaj cu cerneală albastră (X sau bifă în căsuță)
- Rândul 1 (ex. A00) și rândul 2 (ex. A99) sunt **exemple de completare** și se ignoră

### Auto-detecție versiune FSGC
Foaia conține o casetă de culoare (marcată manual cu X) care indică varianta:
- **Albastru** → stânga sus
- **Verde** → dreapta sus
- **Roșu** → stânga jos
- **Galben** → dreapta jos

Selectând **"Auto-detect versiune (FSGC)"** din dropdown, sistemul citește automat acea casetă și alege baremul corect.
Dacă selectezi manual (ex. "FSGC - ALBASTRU"), auto-detecția nu mai rulează.

### Sistem de notare FSGC
`notă = răspunsuri_corecte × 0.2 + 1.0`  (max 10, minim 1 dacă niciun răspuns marcat)

### Bareme FSGC
- Conțin cuvântul **"fsgc"** în nume
- Ca admin FSGC poți crea/edita/șterge bareme pentru facultatea ta
- Baremele generate aleator respectă structura 45 de întrebări, 4 opțiuni

### Export
Rezultatele se salvează în tabelul NocoDB **Fsgc** și în Google Drive.
""",

    'fpse': """
## Contextul tău: FPSE (Facultatea de Psihologie și Științe ale Educației)

### Foaia de răspuns FPSE — două variante

#### Varianta cu 3 răspunsuri (fpse3) — 36 întrebări
- **3 secțiuni** (stânga / mijloc / dreapta), **câte 12 întrebări** fiecare → total **36 întrebări**
- **3 opțiuni** per întrebare: A, B, C
- Rândul 1 (ex. A00) și rândul 2 (ex. A99) sunt **exemple** și se ignoră
- `notă = răspunsuri_corecte × 0.25 + 1.0` (max 10)

#### Varianta cu 4 răspunsuri (fpse) — 45 întrebări
- **3 secțiuni**, **câte 15 întrebări** → total **45 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- `notă = răspunsuri_corecte × 0.2 + 1.0` (max 10)

### Auto-detecție versiune FPSE (Albastru/Verde)
Foaia conține două casete mici (Albastru = V1, Verde = V2). Studentul bifează una.
- **"Auto-detect FPSE 3 răspunsuri"** → detectează albastru/verde și alege barem fpse3
- **"Auto-detect FPSE 4 răspunsuri"** → detectează albastru/verde și alege barem fpse4
- Dacă selectezi manual (ex. "fpse3 albastru"), detecția nu mai rulează și zona nu se desenează pe imagine

### Bareme FPSE
- Conțin cuvântul **"fpse"** în nume (ex. "fpse3 albastru", "fpse verde")
- "fpse3 ..." → 36 întrebări, 3 opțiuni; "fpse ..." (fără 3) → 45 întrebări, 4 opțiuni
- Ca admin FPSE poți crea/edita/șterge bareme pentru facultatea ta

### Export
Rezultatele se salvează în tabelul NocoDB **Fpse** și în Google Drive.
""",

    'fsas': """
## Contextul tău: FSAS / EALR (Facultatea de Sociologie și Asistență Socială)

### Foaia de răspuns FSAS — layout ASIMETRIC
- **3 secțiuni cu dimensiuni diferite**: **20 + 15 + 10 întrebări** → total **45 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- Secțiunile au lățimi diferite! Detecția coloanelor e dinamică (nu fixă ca la FSGC)
- `notă = răspunsuri_corecte × 0.2 + 1.0` (max 10)

### Particularități tehnice FSAS
Datorită layout-ului asimetric, sistemul folosește **detecție dinamică FSAS** (`build_rois_dynamic_fsas`):
- Detectează automat marginile secțiunilor din imagine
- Folosește coordonate hardcodate ca fallback dacă detecția dinamică eșuează
- Nu folosi imaginile FSGC/FPSE cu bareme FSAS — grid-ul e diferit

### Bareme FSAS
- Conțin "**fsas**" sau "**ealr**" în nume
- Structura: 45 întrebări, 4 opțiuni

### Export
Rezultatele se salvează în tabelul NocoDB **Fsas** și în Google Drive.
""",

    'drept': """
## Contextul tău: Drept (Facultatea de Drept)

### Foaia de răspuns Drept
- **3 secțiuni**, **câte 15 întrebări** → total **45 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- Format identic cu FSGC (același tip de grilă)
- `notă = răspunsuri_corecte × 0.2 + 1.0` (max 10)

### Bareme Drept
- Conțin "**drept**" în nume
- Ca admin Drept poți crea/edita bareme pentru facultatea ta

### Export
Rezultatele se salvează în tabelul NocoDB **Drept** și în Google Drive.
""",

    'sport': """
## Contextul tău: Sport (Facultatea de Educație Fizică și Sport)

### Foaia de răspuns Sport
- **3 secțiuni**, **câte 15 întrebări** → total **45 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- `notă = răspunsuri_corecte × 0.225 + 1.0` (max 10)
  *(multiplier ușor diferit față de alte facultăți)*

### Bareme Sport
- Conțin "**sport**" în nume

### Export
Rezultatele se salvează în tabelul NocoDB **Sport** și în Google Drive.
""",

    'finalizare': """
## Contextul tău: Finalizare Studii

### Foaia de răspuns Finalizare
- **1 secțiune**, **10 întrebări**
- **4 opțiuni** per întrebare: A, B, C, D
- `notă = răspunsuri_corecte × 1.0 + 1.0` (max 10, fiecare răspuns valorează 1 punct net)

### Bareme Finalizare
- Conțin "**finalizare**" sau "**finlizare**" în nume
""",
}

_GLOBAL_ADMIN_FACULTY_OVERVIEW = """
## Facultăți și formate suportate

| Facultate | Secțiuni | Întrebări | Opțiuni | Multiplicator |
|-----------|----------|-----------|---------|---------------|
| **FSGC** | 3×15 | 45 | A-D | 0.20 |
| **FPSE (4 răsp.)** | 3×15 | 45 | A-D | 0.20 |
| **FPSE (3 răsp.)** | 3×12 | 36 | A-C | 0.25 |
| **FSAS/EALR** | 20+15+10 | 45 | A-D | 0.20 (asimetric) |
| **Drept** | 3×15 | 45 | A-D | 0.20 |
| **Sport** | 3×15 | 45 | A-D | 0.225 |
| **Finalizare** | 1×10 | 10 | A-D | 1.00 |

Formula generală: `notă = corecte × multiplicator + 1.0` (plafon 10)

### Auto-detecție versiuni
- **FSGC**: casetă colorată (Albastru/Verde/Roșu/Galben) → alege automat baremul
- **FPSE**: două casete mici (Albastru=V1, Verde=V2) → auto-detect 3 sau 4 răspunsuri separat
- **FSAS**: doua casete mici(Randul 1 = V1, Rândul 2 = V2)
- La selecție manuală de barem cu culoare specificată, auto-detecția NU rulează

### Roluri și acces
- **Admin global**: toate facultățile, toți utilizatorii, toate baremele, statistici agregate
- **Admin facultate**: bareme + statistici doar pentru facultatea proprie
- **User/Teacher**: folosirea functionalitatilor de corectare + vizualizare rezultate pentru facultatea proprie
"""

def _build_system_prompt(role: str, faculty: str | None) -> str:

    base = """Ești un asistent inteligent pentru aplicația **ExamAnalyzer** — platformă de autocorectare examene (Universitatea de Vest Timișoara).
Ajuți utilizatorii și profesorii să folosească platforma eficient.
Răspunzi **în limba în care ți se scrie** (română sau engleză). Ești concis, prietenos și precis.
Dacă nu știi ceva sau e vorba de cod intern, spune sincer că nu ai informații.

## Ce face aplicația

ExamAnalyzer corectează automat foile de răspuns la examene de admitere sau finalizare studii de licență. Scanează imagini ale testelor completate, detectează grila, citește marcajele cu cerneală albastră, calculează nota și exportă rezultatele în NocoDB + Google Drive.

## Funcționalități principale

| Funcționalitate | Descriere |
|-----------------|-----------|
| **Upload individual** | O singură foaie → analiză instant → notă + imagine annotată |
| **Procesare Batch** | Până la 250 imagini simultan, tabel rezultate, preview per fișier |
| **Gestionare Bareme** | CRUD pe chei de răspuns, generare aleatoare, filtrare pe facultate |
| **Export NocoDB** | Upload paralel pe Google Drive + inserare bulk în tabele NocoDB |
| **Statistici** | Distribuție note, statistici per întrebare, dashboard |

## Cum se folosește

### Upload individual
1. Mergi la Dashboard → Single Upload
2. Selectează facultatea și baremul
3. Încarcă imaginea foii → aplicația returnează nota + imaginea annotată

### Procesare Batch
1. Mergi la pagina **Batch Processing**
2. Selectează baremul (sau auto-detect dacă e disponibil)
3. Drag & drop până la 250 imagini
4. Vizualizează rezultatele → apasă **Export to NocoDB** pentru a salva

### Erori frecvente
- **"Needs calibration"** → calitate slabă a imaginii sau unghi prea mare
- **"QR not found"** → codul QR al studentului nu a putut fi citit
- **Export eșuat** → verifică conexiunea la NocoDB/Google Drive cu adminul
- **Auto-detect eșuat** → foaia e sărită (grade=None), nu se folosește un barem greșit

## Fișiere acceptate

PNG, JPG, BMP, TIFF — recomandat scanat la minim 200 DPI, drept, fără umbre mari.
"""

    from ..utils.auth import normalize_faculty, is_global_admin
    fac = normalize_faculty(faculty)

    if is_global_admin(role, faculty):
        return base + _GLOBAL_ADMIN_FACULTY_OVERVIEW + """
## Administrare utilizatori (Admin global)
- Aprobare conturi noi, schimbare roluri, asignare facultate
- Pagina Settings → Users
- Pagina Settings → Answer Keys (bareme globale)
"""
    elif fac and fac in _FACULTY_BLOCKS:
        faculty_block = _FACULTY_BLOCKS[fac]
        role_note = ""
        if role == 'admin':
            role_note = f"\n**Rolul tău**: Admin {fac.upper()} — poți crea/edita/șterge bareme și vedea statisticile facultății.\n"
        elif role == 'teacher':
            role_note = f"\n**Rolul tău**: Teacher {fac.upper()} — poți gestiona bareme și vizualiza rezultate pentru facultatea ta.\n"
        else:
            role_note = f"\n**Rolul tău**: User {fac.upper()} — poți corecta foi și vizualiza rezultatele proprii.\n"
        return base + role_note + faculty_block
    else:
        return base + _GLOBAL_ADMIN_FACULTY_OVERVIEW

@api_bp.route('/chat', methods=['POST'])
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get('messages', [])
    if not messages:
        return jsonify({'error': 'No messages provided'}), 400

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'error': 'ANTHROPIC_API_KEY not configured'}), 500

    role    = session.get('user_role', 'user')
    faculty = session.get('user_faculty')
    email   = session.get('user_email', 'anonymous')
    system  = _build_system_prompt(role, faculty)

    sanitized_messages = []
    pii_tags_found = []
    for msg in messages:
        if msg.get('role') == 'user' and isinstance(msg.get('content'), str):
            clean, tags = _sanitize_pii(msg['content'])
            pii_tags_found.extend(tags)
            sanitized_messages.append({**msg, 'content': clean})
        else:
            sanitized_messages.append(msg)

    last_user_msg = next(
        (m['content'] for m in reversed(sanitized_messages) if m.get('role') == 'user'), ''
    )
    logger.info(
        'chat_query user=%s faculty=%s role=%s pii_removed=%s msg_len=%d',
        email, faculty, role, pii_tags_found or None, len(last_user_msg)
    )
    if pii_tags_found:
        logger.warning('chat_pii_sanitized user=%s tags=%s', email, pii_tags_found)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model='claude-haiku-4-5',
            max_tokens=1024,
            system=system,
            messages=sanitized_messages,
        )
        reply = next(
            (block.text for block in response.content if block.type == 'text'), ''
        )
        return jsonify({'reply': reply})
    except anthropic.AuthenticationError:
        return jsonify({'error': 'Invalid API key'}), 401
    except anthropic.RateLimitError:
        return jsonify({'error': 'Rate limit reached, try again later'}), 429
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Sistem Automat de Corecție a Foilor de Răspuns prin Tehnici de Computer Vision

**Lucrare de Licență — Universitatea de Vest din Timișoara, Facultatea de Informatică**
*Autor: Andrei Vițan · Coordonator: Asist. Univ. Drd. Theodor Radu Grumeza · 2026*

---

## Context

Sesiunile de admitere universitară și examenele de finalizare a studiilor de licență
se constituie, din perspectiva logisticii educaționale, drept unele dintre cele mai
solicitante procese administrative pe care o instituție de învățământ superior le
parcurge anual. La Universitatea de Vest din Timișoara, examinarea candidaților implică
sute până la câteva mii de participanți per sesiune, distribuiți pe facultăți cu
tipare structurale distincte ale foilor de răspuns. În absența unui instrument software
dedicat, evaluarea manuală a unui lot mare de lucrări într-un timp limitat constituie
o sursă recurentă de erori umane, iar soluțiile comerciale specializate sunt costisitoare
și presupun stocarea datelor pe servere terțe.

Lucrarea propune un sistem software de **automatizare integrală** a procesului
de evaluare, conceput pentru a elimina intervenția manuală în etapele critice
de selectare a baremului, citire a marcajelor și transcriere a rezultatelor.

## Contribuții

Lucrarea aduce șase contribuții tehnice principale:

1. **Pipeline de Computer Vision dinamic** — detecția grilei se realizează prin
   morfologie matematică și clusterizare adaptivă, cu un mecanism de amprentă
   structurală MD5 (*grid hash*) care identifică automat tipul foii de răspuns,
   completat de un mecanism de siguranță (*fallback*) la coordonate de rezervă fixe.

2. **Identificare univocă a candidaților prin coduri QR** integrate în foaia de
   răspuns, cu cascadă de fallback în mai multe niveluri pentru robustețe în
   condiții reale de fotografiere.

3. **Detecție complet automată a cheii de barem active** prin recunoașterea
   marcajelor aplicate de candidat pe câmpul dedicat al foii, *fără nicio
   intervenție manuală din partea operatorului* — aplicabilă atât în sesiunile
   de admitere, cât și în examenele de finalizare a studiilor de licență.

4. **Arhitectură multi-tenant** care deservește simultan mai multe facultăți
   cu configurații și date complet izolate la nivel de schemă.

5. **Interfață web modernă de tip SPA** (React + TypeScript), cu mecanism
   *human-in-the-loop* de aprobare explicită a fiecărui rezultat înainte de
   exportul în baza de date instituțională.

6. **Asistent conversațional contextual** bazat pe modelul Claude Haiku al
   companiei Anthropic, conceput pentru a ghida utilizatorii pe parcursul
   fluxului operațional și pentru a reduce curba de învățare a aplicației.

## Arhitectură (sinteză)

Aplicația urmează o arhitectură multi-tier cu separare riguroasă a responsabilităților:

- **Frontend**: aplicație SPA React 18 + TypeScript, cu state global gestionat
  prin Zustand și styling Tailwind CSS utility-first.
- **Backend**: Flask 3.1 rulat sub Gunicorn cu workeri Gevent, care asigură
  concurență ridicată prin *monkey-patching* peste modulele standard de I/O Python.
- **Procesare paralelă**: `ThreadPoolExecutor` pentru analiza concurentă a
  loturilor și pentru upload-urile asincrone către Google Drive.
- **Sesiuni**: Redis ca backend pentru `Flask-Session`.
- **Persistență**: NocoDB peste PostgreSQL, cu câte un tabel dedicat per facultate,
  garantând izolarea logică a datelor între entități diferite.
- **Cloud Storage**: Google Drive pentru arhivarea PNG-urilor adnotate cu grila detectată.
- **LLM**: API-ul Anthropic prin SDK-ul oficial Python, cu sanitizare PII
  înainte de orice transmitere către modelul de limbaj.

## Validare experimentală

Sistemul a fost validat pe un corpus de **peste 1000 de foi de răspuns** provenite
din sesiunile reale de admitere ale UVT (2025), atingând:

- **97% acuratețe** în detecția marcajelor per răspuns individual;
- **98% acuratețe** în detecția automată a baremului activ;
- **2–5 secunde** timp mediu de procesare per foaie.

## Structura repository-ului

```
autocorectare/
├── backend/                Server Flask de producție
│   ├── app/
│   │   ├── routes/         auth_routes, exam_routes, upload_routes, chat_routes
│   │   └── utils/          config, auth, drive_upload
│   └── run.py              Entry point pentru Gunicorn
├── frontend/               Aplicație SPA React + TypeScript
│   └── src/                pages, components, store, api, utils
├── exam_analysis.py        Modulul principal de Computer Vision
├── answer_keys.json        Bareme per facultate (ignorat în git)
├── sheet_configs.json      Configurații de foi detectate dinamic
├── nginx.conf              Configurație reverse proxy
└── restart.sh              Script de pornire Gunicorn
```

## Stiva tehnologică

| Domeniu | Tehnologie |
|---|---|
| Backend | Python 3.12 · Flask 3.1 · Gunicorn + Gevent |
| Computer Vision | OpenCV 4.9 · pyzbar · Tesseract OSD |
| Frontend | React 18 · TypeScript 5.3 · Vite 5 · Tailwind CSS · Zustand |
| Persistență | NocoDB · PostgreSQL · Redis |
| Cloud | Google Drive API |
| LLM | Anthropic Claude Haiku |

## Securitatea aplicației

Aplicația implementează un model RBAC (*Role-Based Access Control*) cu trei
niveluri ierarhice de privilegii: administrator global, administrator facultate
și corector facultate. Sesiunile sunt gestionate server-side prin Flask-Session
(stocare Redis), cu directivele `HttpOnly`, `SameSite=Lax` și `Secure` activate.
Parolele sunt stocate folosind dispersie SHA-512, iar cheia de API a modelului
de limbaj este păstrată exclusiv server-side, fără expunere către browser.

Orice informație personală identificabilă (CNP, adresă de email, număr de
telefon) este redactată prin expresii regulate înainte de transmiterea către
modelul de limbaj. Asistentul conversațional integrat este delimitat strict
la ghidarea operațională a utilizatorului, fără acces la datele personale ale
candidaților și fără capacitate de decizie asupra rezultatelor — decizia finală
rămânând, în toate scenariile, sub controlul operatorului uman.

# 🚀 Instrukcja Wdrożenia Produkcyjnego GastroApp

Dokument zawiera kompletny przewodnik krok po kroku wdrożenia aplikacji **GastroApp** na serwery produkcyjne **Firebase Hosting** oraz podpięcia własnej domeny **`simpledesignacademy.com`**.

---

## 📋 Podsumowanie Techniczne
* **Projekt Firebase:** `gastro-app-8e55e`
* **Ścieżka dystrybucyjna (Build):** `dist/gastro-app/browser`
* **Silnik hostingu:** Globalny CDN Google (Firebase Hosting) z bezpłatnym certyfikatem SSL (HTTPS)
* **Routing:** Single Page Application (przepisywanie tras `**` &rarr; `/index.html`)

---

## ⚠️ KROK 0: Domena i serwer w OVH – Jak to działa i gdzie się logujesz?

Masz domenę oraz serwer w **OVH** (`simpledesignacademy.com`). Oto jak podzielone są role:

1. **Gdzie stoi aplikacja GastroApp?**
   * Aplikacja GastroApp (kod Angulara, baza Firestore, autoryzacja) działa w chmurze **Google Firebase Hosting**. Dzięki temu ma darmowy certyfikat SSL, globalny CDN i natychmiastowe aktualizacje.
2. **Do czego służy OVH?**
   * **Tak, logujesz się do Panelu Klienta OVH** ([ovh.pl](https://www.ovh.com/auth/)), ponieważ OVH zarządza Twoją domeną (serwerami DNS). To w OVH wpisujesz „drogowskaz” (rekord CNAME lub A), który mówi przeglądarkom: *„gdy ktoś wpisze ten adres, pobierz stronę z Firebase”*.

### 🚨 Bardzo ważny wybór (Ochrona Twojego serwera w OVH):

* 🌟 **OPCJA A (Zdecydowanie zalecana): Subdomena np. `gastro.simpledesignacademy.com` lub `app.simpledesignacademy.com`**
  * **Dlaczego to najlepsze rozwiązanie?** Twój serwer w OVH, istniejąca strona WWW (np. WordPress/landing page pod `simpledesignacademy.com`) oraz **poczta e-mail w OVH pozostają nienaruszone i działają tak jak dotychczas!**
  * W OVH dodajemy tylko jeden prosty wpis przekierowujący samą subdomenę do Firebase.
* ⚠️ **OPCJA B: Domena główna `simpledesignacademy.com`**
  * **Uwaga:** Jeśli zmienisz rekordy główne domeny na Firebase, **Twój obecny serwer w OVH przestanie wyświetlać stronę główną**, a pod adresem `simpledesignacademy.com` pojawi się bezpośrednio GastroApp.

---

## 🛠️ KROK 1: Zbudowanie i wdrożenie aplikacji z terminala

Wykonaj poniższe polecenia w terminalu na swoim komputerze w folderze projektu:

### 1.1. Zbuduj najnowszą wersję produkcyjną
Kompiluje kod Angulara, minifikuje skrypty i przygotowuje pliki w `dist/gastro-app/browser`:
```bash
npm run build
```
*(Kompilacja jest już sprawdzona i gotowa – kończy się statusem `Application bundle generation complete`)*.

---

### 1.2. Zaloguj się do Firebase CLI
Polecenie autoryzuje Twój komputer w Google Firebase:
```bash
npx firebase-tools login
```
* W przeglądarce otworzy się strona logowania Google.
* Wybierz konto Google, na którym utworzony jest projekt **`gastro-app-8e55e`**.
* W terminalu pojawi się: `Success! Logged in as twoj-email@...`.

---

### 1.3. Wdróż aplikację na serwery Google
Wyślij skompilowaną paczkę do Firebase:
```bash
npx firebase-tools deploy --only hosting
```
Po kilkunastu sekundach otrzymasz bezpośredni link działający online, np.:
* `Hosting URL: https://gastro-app-8e55e.web.app`
* Możesz już teraz wejść z telefonu i zobaczyć działającą aplikację!

---

## 🌐 KROK 2: Zgłoszenie domeny w Firebase Console

Zanim dodasz wpis w OVH, poinformuj Firebase, jakiej domeny będziesz używać:

1. Otwórz w przeglądarce: [Firebase Console](https://console.firebase.google.com/).
2. Wejdź w projekt: **`gastro-app-8e55e`**.
3. W menu bocznym przejdź do: **Kompilacja (Build)** &rarr; **Hosting**.
4. Kliknij przycisk **„Dodaj domenę niestandardową” (Add custom domain)**.
5. Wpisz wybraną domenę:
   * **Dla subdomeny (polecane):** wpisz np. `gastro.simpledesignacademy.com`
   * **Dla domeny głównej:** wpisz `simpledesignacademy.com`
6. Kliknij **Dalej**. Firebase pokaże rekordy DNS, które musisz wprowadzić w OVH.

---

## 📡 KROK 3: Konfiguracja w Panelu Klienta OVH (Krok po kroku)

**To jest moment, w którym logujesz się do OVH!**

1. Wejdź na [Panel Klienta OVH](https://www.ovh.com/auth/) i zaloguj się na swoje konto OVH.
2. W lewym górnym menu upewnij się, że jesteś w zakładce **Web Cloud**.
3. W lewej kolumnie kliknij **Domeny** &rarr; wybierz **`simpledesignacademy.com`**.
4. W poziomych zakładkach na środku ekranu kliknij **Strefa DNS** (DNS Zone).

---

### 🔹 Wariant 1: Dodanie Subdomeny (np. `gastro.simpledesignacademy.com` – Rekomendowane)

Nie musisz modyfikować żadnych istniejących wpisów! Dodajesz tylko jeden nowy wpis:

1. Po prawej stronie kliknij przycisk **„Dodaj rekord”** (Add an entry).
2. Wybierz typ rekordu: **CNAME**.
3. Wypełnij formularz:
   * **Poddomena (Subdomain):** wpisz `gastro` (tylko słowo `gastro`, OVH samo doklei resztę domeny).
   * **TTL:** zostaw domyślne (np. `0` lub `3600`).
   * **Wartość / Cel (Target):** wpisz `gastro-app-8e55e.web.app.` *(z kropką na końcu, jeśli OVH tego wymaga, lub bez kropki – formularz podpowie format)*.
4. Kliknij **Dalej**, a następnie **Zatwierdź**.

> [!TIP]
> Dzięki temu zabiegowi Twój serwer w OVH i cała strona `simpledesignacademy.com` działają bez zmian, a pod adresem `gastro.simpledesignacademy.com` wyświetla się GastroApp!

---

### 🔹 Wariant 2: Podpięcie Domeny Głównej (`simpledesignacademy.com`)

*(Stosuj tylko, jeśli GastroApp ma całkowicie zastąpić obecną stronę na serwerze OVH)*:

1. W zakładce **Strefa DNS** znajdź istniejący rekord typu **A** dla domeny głównej (gdzie pole poddomeny jest puste).
2. Kliknij ikonę trzech kropek `...` obok niego i wybierz **Zmień rekord**.
3. Zmień docelowy adres IP na pierwszy adres IP podany przez Firebase (np. `199.36.158.100`).
4. Dodaj drugi rekord **A** z drugim adresem IP wskazanym przez Firebase.

---

## 🔐 KROK 4: Autoryzacja logowania w Firebase Authentication

Aby użytkownicy mogli bezpiecznie logować się i rejestrować z Twojej własnej domeny, dodaj ją do listy zaufanych:

1. W [Firebase Console](https://console.firebase.google.com/) przejdź do: **Authentication** &rarr; zakładka **Ustawienia (Settings)**.
2. Wybierz sekcję **Autoryzowane domeny (Authorized domains)**.
3. Kliknij **Dodaj domenę (Add domain)**.
4. Wpisz:
   * `simpledesignacademy.com` (oraz ewentualnie subdomenę `gastro.simpledesignacademy.com`).
5. Kliknij **Zapisz**.

---

## 🔒 KROK 5: Weryfikacja i Certyfikat SSL (HTTPS)

1. Po dodaniu rekordów DNS w panelu Firebase status domeny zmieni się na:
   * *Oczekiwanie na DNS (Pending DNS)* &rarr; *Sprawdzanie stanu (Validating)* &rarr; **Połączono (Connected)**.
2. **Certyfikat SSL:** Google automatycznie wystawia bezpłatny certyfikat SSL Let's Encrypt / Google Trust Services.
   * Czas aktywacji: zazwyczaj od 15 minut do 2–4 godzin (zależy od czasu propagacji serwerów DNS na świecie).
3. Po zakończeniu strona będzie w pełni zabezpieczona kłódeczką HTTPS.

---

## 🔄 Jak wdrażać kolejne aktualizacje w przyszłości?

Kiedy w przyszłości wprowadzisz jakiekolwiek zmiany w kodzie aplikacji, cały proces aktualizacji na żywo sprowadza się do **jednego polecenia**:

```bash
npm run build && npx firebase-tools deploy --only hosting
```
W ciągu kilkunastu sekund nowa wersja znajdzie się na Twojej domenie bez przestojów (zero-downtime deployment).

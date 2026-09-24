# 📋 Scenariusz Testów Manualnych GastroApp (Test Suite)

Dokument zawiera kompletny, ustrukturyzowany plan weryfikacji wszystkich funkcjonalności systemu **GastroApp**. Każdy etap zawiera dokładne instrukcje postępowania, oczekiwany rezultat oraz potencjalne punkty krytyczne (*edge cases*).

---

## 🧭 ETAP 1: Układ, Nawigacja i Pasek Boczny (Sidebar Shell)

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **1.1** | Na komputerze zacznij przewijać stronę w dół (np. na liście Receptur lub Magazynu). | Górna belka (`header`) i lewe menu (`aside`) pozostają zablokowane w miejscu (100% wysokości ekranu). Przewija się wyłącznie centralny obszar roboczy (`main`). | Czy logo GastroApp lub stopka nie uciekają poza krawędź ekranu? |
| **1.2** | Kliknij przycisk **Burgera** obok nazwy restauracji w górnym pasku. | Menu płynnie zwija się do samych ikon (`w-20` / 80px), a przestrzeń robocza po prawej stronie rozszerza się. | Czy ikony są idealnie wycentrowane? Czy po najechaniu kursorem na ikonę pojawia się chmurka (`title`) z nazwą modułu? |
| **1.3** | Kliknij przycisk burgera ponownie. | Menu płynnie rozwija się z powrotem do pełnej szerokości (`w-72` / 288px). | Czy teksty i logo nie ulegają zniekształceniu podczas animacji? |
| **1.4** | Zmniejsz szerokość okna przeglądarki (zwężaj powoli od prawej strony). | Poniżej **900px** menu samoczynnie zwija się do trybu ikon (`BreakpointObserver`). Poniżej **768px** menu chowa się całkiem (burger otwiera wysuwany drawer z przyciemnionym tłem). | Czy po powiększeniu okna powyżej 900px menu powraca do pełnej szerokości? |

---

## 🎨 ETAP 2: Profil, Ciemny Motyw i Ustawienia Konta

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **2.1** | Kliknij pomarańczowy kafelek z literą (awatar profilu) w prawym górnym rogu. | Otwiera się menu profilowe z Twoim adresem e-mail oraz bieżącą nazwą lokalu. | Czy kliknięcie w tło poza menu poprawnie zamyka okienko? |
| **2.2** | Kliknij przełącznik **„Ciemny motyw”**. | Aplikacja natychmiast zmienia tło na elegancki ciemny grafit, a teksty stają się jasne. Suwak przesuwa się w prawo z animacją iOS. | Czy wszystkie kafelki, formularze i modale są czytelne w trybie ciemnym? Czy żaden tekst nie zlewa się z tłem? |
| **2.3** | Kliknij **„Ustawienia konta”**. | Wyświetla się modal z możliwością zmiany nazwy restauracji oraz zmiany hasła. | Zmień nazwę na próbę (np. dodaj `!` na końcu) i zapisz. Czy nazwa w nagłówku i na awatarze natychmiast się zaktualizowała? |

---

## 📦 ETAP 3: Magazyn Surowców (`/inventory`)

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **3.1** | Wejdź do zakładki **Magazyn Składników**. | Wyświetla się pełna lista surowców (w tym *Szynka Prosciutto Cotto*, *Salami Spianata*, sery DOP, składniki deserów). | Czy na liście znajduje się Prosciutto Cotto z właściwą jednostką `g`? |
| **3.2** | Kliknij kafelki filtrów u góry: **„Niski stan”**, **„Brak surowca”**, **„Dostępne”**. | Tabela natychmiast filtruje pozycje wg wybranego statusu magazynowego. Kliknięcie „Wszystkie” resetuje filtr. | Czy liczby w kafelkach statystyk zgadzają się z liczbą przefiltrowanych wierszy? |
| **3.3** | Wpisz w wyszukiwarkę słowo „ser” lub „mąka”. | Lista surowców filtruje się w czasie rzeczywistym. Przycisk `X` czyści pole wyszukiwania. | Czy wyszukiwarka ignoruje wielkość liter i polskie znaki? |
| **3.4** | Kliknij **„+ Dostawa”** przy wybranym składniku (np. Mąka). | Wpisz np. `5` i wybierz jednostkę `kg`. Kliknij zatwierdź. | Czy stan surowca wzrósł dokładnie o 5 000 g (5 kg)? Czy pojawił się zielony komunikat powiadomienia (Toast)? |
| **3.5** | Kliknij **„+ Dodaj surowiec”** w prawym górnym rogu. | Wypełnij formularz nowym produktem (np. *Sos Czosnkowy*, ilość 1000 ml, próg 200 ml, kategoria *Dodatki*). | Czy nowy surowiec pojawił się w tabeli i jest dostępny w recepturach? |
| **3.6** | Kliknij **„Zarządzaj kategoriami”**. | Dodaj nową kategorię (np. *Napoje*), zmień nazwę istniejącej. | Czy nowa kategoria pojawia się na liście filtrowania i w formularzu dodawania surowca? |

---

## 🍕 ETAP 4: Receptury i Symulator Wydajności Kuchni (`/recipes`)

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **4.1** | Wejdź do zakładki **Receptury & Wydajność**. | Widzisz karty dań (pizze czerwone, białe, calzone, focaccie, desery). Każda ma wyliczoną wydajność w porcjach. | Czy przy żadnym daniu nie pojawia się błąd „Nieznany surowiec 0 porcji”? |
| **4.2** | Otwórz pozycję **Pizza Prosciutto e Funghi 32cm** (kliknij „Analiza porcji”). | Wyświetla się modal z tabelą zużycia. *Prosciutto Cotto* oraz *Pieczarki* mają czerwoną plakietkę **„Limituje”** (wspólne wąskie gardło na 28 porcji). | Czy przycisk na dole **„Przejdź do magazynu i uzupełnij braki”** poprawnie przekierowuje do `/inventory`? |
| **4.3** | W tym samym oknie kliknij pomarańczowy przycisk **„Edytuj recepturę”**. | Otwiera się formularz edycji receptury. | **Kluczowy test:** Czy wiersz z Prosciutto Cotto (70 g lub 60 g w Calzone) ma poprawnie zaznaczony surowiec w rozwijanej liście (brak pustego pola)? |
| **4.4** | Dodaj nową testową recepturę przez przycisk **„+ Nowa receptura”**. | Wpisz nazwę, wybierz składniki i zapisz. | Czy po zapisaniu danie pojawia się na liście i natychmiast przelicza swoją dostępność na podstawie stanu magazynu? |

---

## 🧑‍🍳 ETAP 5: Zamówienia i Kuchnia KDS (`/orders` oraz Pulpit)

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **5.1** | Przejdź do **Pulpitu (Dashboard)**. | W sekcji *Aktywne zamówienia na kuchni (7)* widzisz 5 kafelków zamówień oraz **6. interaktywny kafelek `+2 więcej w KDS`**. | Czy siatka ma idealne 2 rzędy po 3 kafelki bez pustego miejsca? Czy kliknięcie w `+2 więcej` przenosi do KDS? |
| **5.2** | Na tablicy KDS kliknij **„+ Nowe zamówienie”**. | Wybierz stolik i dodaj 2x Pizza Margherita. Zatwierdź. | Czy zamówienie pojawiło się w kolumnie *1. Oczekujące* z licznikiem „Przed chwilą”? |
| **5.3** | **Test odpisu magazynowego:** Przed realizacją sprawdź stan Mozzarelli i Sosu w magazynie. Na tablicy KDS przesuń zamówienie: *Do kuchni* &rarr; *Gotowe* &rarr; *Wydaj gościowi*. | Przy finalnym wydaniu zamówienia składniki zostają automatycznie odpisane z magazynu. | Wejdź do magazynu: czy stan sera i sosu pomniejszył się dokładnie o 2 porcje z receptury? |
| **5.4** | Wróć na Pulpit i sprawdź kafelek **„Wydane dzisiaj”**. | Licznik wydanych wzrósł o 1, a kwota obrotu powiększyła się o wartość zamówienia. | Czy łączny obrót dzienny zgadza się co do grosza? |

---

## 📱 ETAP 6: Menu Gościa (Karta dań przez QR / link publiczny)

| Krok | Akcja testera | Oczekiwany rezultat | Co weryfikować (potencjalne błędy) |
| :--- | :--- | :--- | :--- |
| **6.1** | Wejdź w **„Karta Dań & Menu”** i kliknij podgląd publicznego menu gościa. | Otwiera się strona menu z nazwą restauracji przystosowana pod smartfony. | Czy gość widzi dania z aktualnymi cenami, kategoriami i opisami? |
| **6.2** | W magazynie sztucznie zredukuj stan np. *Bazylii* lub *Pieczarek* do 0. | W menu gościa pizza Margherita lub Funghi natychmiast oznacza się jako **„Chwilowo niedostępna”**! | Czy gość jest chroniony przed zamówieniem dania, na które w kuchni brakuje surowców? |

---
*Wygenerowano dla GastroApp v1.0*

import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('powinien zostać zainicjalizowany z pustą listą powiadomień', () => {
    expect(service.toasts()).toEqual([]);
  });

  describe('show & dismiss', () => {
    it('powinien dodać powiadomienie do listy z unikalnym ID i domyślnym czasem trwania 4500ms', () => {
      const id = service.show({
        type: 'info',
        message: 'Testowa wiadomość'
      });

      expect(id).toBeDefined();
      expect(service.toasts().length).toBe(1);
      const toast = service.toasts()[0];
      expect(toast.id).toBe(id);
      expect(toast.data.message).toBe('Testowa wiadomość');
      expect(toast.data.duration).toBe(4500);
      expect(toast.createdAt).toBeDefined();
    });

    it('powinien respektować niestandardowy czas trwania przekazany w danych', () => {
      service.show({
        type: 'warning',
        message: 'Krótki alert',
        duration: 2000
      });

      expect(service.toasts()[0].data.duration).toBe(2000);
    });

    it('powinien ograniczać liczbę jednoczesnych powiadomień do maksymalnie 4 (usuwając najstarsze)', () => {
      const id1 = service.show({ type: 'info', message: 'Toast 1' });
      const id2 = service.show({ type: 'info', message: 'Toast 2' });
      const id3 = service.show({ type: 'info', message: 'Toast 3' });
      const id4 = service.show({ type: 'info', message: 'Toast 4' });

      expect(service.toasts().length).toBe(4);
      expect(service.toasts().map(t => t.id)).toEqual([id1, id2, id3, id4]);

      // Dodanie 5. powiadomienia powinno wypchnąć id1
      const id5 = service.show({ type: 'info', message: 'Toast 5' });

      expect(service.toasts().length).toBe(4);
      expect(service.toasts().map(t => t.id)).toEqual([id2, id3, id4, id5]);
    });

    it('powinien usunąć powiadomienie o wskazanym ID przy wywołaniu dismiss', () => {
      const id1 = service.show({ type: 'info', message: 'T1' });
      const id2 = service.show({ type: 'info', message: 'T2' });

      expect(service.toasts().length).toBe(2);

      service.dismiss(id1);

      expect(service.toasts().length).toBe(1);
      expect(service.toasts()[0].id).toBe(id2);
    });
  });

  describe('Metody pomocnicze dla typów powiadomień', () => {
    it('success() powinien wygenerować powiadomienie typu success z domyślnym tytułem "Sukces"', () => {
      service.success('Operacja zakończona');
      const toast = service.toasts()[0];

      expect(toast.data.type).toBe('success');
      expect(toast.data.title).toBe('Sukces');
      expect(toast.data.message).toBe('Operacja zakończona');
    });

    it('success() powinien zachować niestandardowy tytuł', () => {
      service.success('Zapisano dane', 'Zamówienie #101');
      const toast = service.toasts()[0];

      expect(toast.data.title).toBe('Zamówienie #101');
    });

    it('danger() powinien wygenerować powiadomienie typu danger z domyślnym tytułem "Brak surowca w magazynie"', () => {
      service.danger('Skończyła się mąka');
      const toast = service.toasts()[0];

      expect(toast.data.type).toBe('danger');
      expect(toast.data.title).toBe('Brak surowca w magazynie');
      expect(toast.data.message).toBe('Skończyła się mąka');
    });

    it('warning() powinien wygenerować powiadomienie typu warning z domyślnym tytułem "Ostrzeżenie magazynu"', () => {
      service.warning('Kończy się ser');
      const toast = service.toasts()[0];

      expect(toast.data.type).toBe('warning');
      expect(toast.data.title).toBe('Ostrzeżenie magazynu');
      expect(toast.data.message).toBe('Kończy się ser');
    });

    it('info() powinien wygenerować powiadomienie typu info z domyślnym tytułem "Powiadomienie"', () => {
      service.info('Nowy stolik zajęty');
      const toast = service.toasts()[0];

      expect(toast.data.type).toBe('info');
      expect(toast.data.title).toBe('Powiadomienie');
      expect(toast.data.message).toBe('Nowy stolik zajęty');
    });

    it('powinien obsługiwać opcjonalne akcje i callbacki w powiadomieniu', () => {
      const actionSpy = jasmine.createSpy('actionCallback');
      service.warning('Niski stan magazynowy', 'Magazyn', 'Uzupełnij', actionSpy);

      const toast = service.toasts()[0];
      expect(toast.data.actionText).toBe('Uzupełnij');
      expect(toast.data.actionCallback).toBe(actionSpy);

      // Wywołanie callbacku
      toast.data.actionCallback!();
      expect(actionSpy).toHaveBeenCalled();
    });
  });
});

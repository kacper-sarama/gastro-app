import { TestBed } from '@angular/core/testing';
import { PromotionService } from './promotion.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { RecipeService } from './recipe.service';
import { ToastService } from './toast.service';
import { Promotion } from '../models/promotion.model';
import { OrderItem } from '../models/order.model';
import { signal } from '@angular/core';

describe('PromotionService (Discount & Validation Engine)', () => {
  let service: PromotionService;

  beforeEach(() => {
    const mockFirestore = {};
    const mockAuthService = {
      currentUser: signal(null),
      currentUserId: 'rest-123'
    };
    const mockInventoryService = {
      items: signal([])
    };
    const mockRecipeService = {
      recipes: signal([])
    };
    const mockToastService = {
      success: jasmine.createSpy('success'),
      info: jasmine.createSpy('info'),
      warning: jasmine.createSpy('warning'),
      danger: jasmine.createSpy('danger')
    };

    TestBed.configureTestingModule({
      providers: [
        PromotionService,
        { provide: Firestore, useValue: mockFirestore },
        { provide: AuthService, useValue: mockAuthService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: RecipeService, useValue: mockRecipeService },
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(PromotionService);
  });

  it('powinien odrzucić promocję, jeśli isActive jest ustawione na false', () => {
    const inactivePromo: Promotion = {
      id: 'p-1',
      restaurantId: 'rest-1',
      name: 'Nieaktywna promocja',
      description: 'Test',
      type: 'code_discount',
      condition: {},
      reward: { rewardType: 'discount_percent', discountValue: 15 },
      isActive: false,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Margherita', quantity: 1, unitPrice: 35 }
    ];

    const result = service.calculateValidationAndDiscount(inactivePromo, items);
    expect(result.isEligible).toBeFalse();
    expect(result.missingRequirementReason).toContain('nieaktywna');
    expect(result.discountAmount).toBe(0);
  });

  it('powinien poprawnie naliczyć procentowy rabat na całe zamówienie', () => {
    const percentPromo: Promotion = {
      id: 'p-2',
      restaurantId: 'rest-1',
      name: 'Happy Hours -10%',
      description: '10% rabatu na całe zamówienie',
      type: 'happy_hours',
      condition: {},
      reward: { rewardType: 'discount_percent', discountValue: 10 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Margherita', quantity: 2, unitPrice: 35 }, // 70 zł
      { recipeId: 'r2', recipeName: 'Tiramisu', quantity: 1, unitPrice: 20 }           // 20 zł => razem 90 zł
    ];

    const result = service.calculateValidationAndDiscount(percentPromo, items);
    expect(result.isEligible).toBeTrue();
    expect(result.discountAmount).toBe(9); // 10% z 90 zł = 9 zł
  });

  it('powinien zgłosić brakującą kwotę, gdy nie osiągnięto progu minimalnego (minOrderValue)', () => {
    const thresholdPromo: Promotion = {
      id: 'p-3',
      restaurantId: 'rest-1',
      name: 'Od 100 zł rabat 20 zł',
      description: 'Zrób zakupy za 100 zł',
      type: 'threshold_bonus',
      condition: { minOrderValue: 100 },
      reward: { rewardType: 'discount_amount', discountValue: 20 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Diavola', quantity: 2, unitPrice: 40 } // 80 zł (brakuje 20 zł)
    ];

    const result = service.calculateValidationAndDiscount(thresholdPromo, items);
    expect(result.isEligible).toBeFalse();
    expect(result.missingRequirementReason).toContain('Brakuje jeszcze 20.00 zł');
    expect(result.discountAmount).toBe(0);
  });

  it('powinien poprawnie naliczyć rabat BOGO (-50% na najtańsze danie z zamówienia)', () => {
    const bogoPromo: Promotion = {
      id: 'p-4',
      restaurantId: 'rest-1',
      name: 'Druga pizza -50%',
      description: 'Druga tańsza pizza za pół ceny',
      type: 'bogo',
      condition: {
        requiredQuantity: 2
      },
      reward: { rewardType: 'discount_percent', discountValue: 50 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Parma (droższa)', quantity: 1, unitPrice: 48 },
      { recipeId: 'r2', recipeName: 'Pizza Margherita (tańsza)', quantity: 1, unitPrice: 32 }
    ];

    const result = service.calculateValidationAndDiscount(bogoPromo, items);
    expect(result.isEligible).toBeTrue();
    // Najtańsza to Margherita (32 zł). -50% to 16 zł rabatu!
    expect(result.discountAmount).toBe(16);
  });

  it('powinien odrzucić promocję wymagającą konkretnej kategorii, jeśli koszyk nie zawiera wystarczającej liczby dań z tej kategorii', () => {
    const categoryPromo: Promotion = {
      id: 'p-5',
      restaurantId: 'rest-1',
      name: '2 Pizze w zestawie',
      description: 'Wymaga min. 2 dań z kategorii Pizza Rossa',
      type: 'combo',
      condition: {
        requiredCategory: 'Pizza Rossa',
        requiredQuantity: 2
      },
      reward: { rewardType: 'discount_amount', discountValue: 15 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    // 1 Pizza Rossa i 1 Deser (inny niż Pizza Rossa)
    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Margherita', category: 'Pizza Rossa', quantity: 1, unitPrice: 35 },
      { recipeId: 'r2', recipeName: 'Tiramisu', category: 'Desery', quantity: 1, unitPrice: 22 }
    ];

    const result = service.calculateValidationAndDiscount(categoryPromo, items);
    expect(result.isEligible).toBeFalse();
    expect(result.missingRequirementReason).toContain('Dodaj jeszcze 1 szt. dań z kategorii "Pizza Rossa"');
    expect(result.discountAmount).toBe(0);
  });

  it('dla 3 dań o różnych cenach w promocji BOGO rabat powinien zostać naliczony z najtańszego pojedynczego egzemplarza', () => {
    const bogoPromo: Promotion = {
      id: 'p-6',
      restaurantId: 'rest-1',
      name: 'Druga pizza -50%',
      description: 'Najtańsza za pół ceny',
      type: 'bogo',
      condition: { requiredQuantity: 2 },
      reward: { rewardType: 'discount_percent', discountValue: 50 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const items: OrderItem[] = [
      { recipeId: 'r1', recipeName: 'Pizza Suprema', quantity: 1, unitPrice: 52 },
      { recipeId: 'r2', recipeName: 'Pizza Prosciutto', quantity: 1, unitPrice: 44 },
      { recipeId: 'r3', recipeName: 'Pizza Marinara', quantity: 1, unitPrice: 28 } // najtańsza z trzech
    ];

    const result = service.calculateValidationAndDiscount(bogoPromo, items);
    expect(result.isEligible).toBeTrue();
    // 50% z 28 zł = 14 zł rabatu
    expect(result.discountAmount).toBe(14);
  });

  it('dla pustego zamówienia (brak pozycji) rabat powinien wynosić 0 zł bez rzucania błędów', () => {
    const promo: Promotion = {
      id: 'p-7',
      restaurantId: 'rest-1',
      name: '10% na wszystko',
      description: 'Rabat',
      type: 'code_discount',
      condition: {},
      reward: { rewardType: 'discount_percent', discountValue: 10 },
      isActive: true,
      usageCount: 0,
      totalDiscountGiven: 0,
      revenueGenerated: 0,
      createdAt: '',
      updatedAt: ''
    };

    const result = service.calculateValidationAndDiscount(promo, []);
    expect(result.isEligible).toBeTrue();
    expect(result.discountAmount).toBe(0);
  });
});

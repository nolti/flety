import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArticleDialog } from './article-dialog';

describe('ArticleDialog', () => {
  let component: ArticleDialog;
  let fixture: ComponentFixture<ArticleDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticleDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArticleDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

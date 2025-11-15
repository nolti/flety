import { ChangeDetectionStrategy, Component, OnInit, signal, Inject, PLATFORM_ID, AfterViewInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconRegistry } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { AbstractControl, ValidationErrors, FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule, FormArray } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http'; // <-- ¡Añadir esta línea!
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { map, startWith, switchMap, debounceTime, catchError } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { MY_DATE_FORMATS } from './app.config';
import { MAT_DATE_LOCALE, MAT_DATE_FORMATS, DateAdapter } from '@angular/material/core';
import { isValid, parse, differenceInDays, setHours, setMinutes, parse as parseDate } from 'date-fns';
import { ArticleDialogComponent } from './article-dialog/article-dialog';

declare const google: any;

function timeFormatValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) {
    return null;
  }

  if (value instanceof Date && isValid(value)) {
    return null;
  }

  if (typeof value === 'string') {
    const parsedTime = parse(value, 'HH:mm', new Date());
    if (isValid(parsedTime)) {
      return null;
    }
  }

  return { invalidTimeFormat: true };
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    MatListModule,
    MatDividerModule,
    MatAutocompleteModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatStepperModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatTableModule
    ],
  providers: [
    MatIconRegistry,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('stepper') stepper!: MatStepper;
  firstFormGroup!: FormGroup;
  secondFormGroup!: FormGroup;
  thirdFormGroup!: FormGroup;

  filteredDestinoOptions!: Observable<string[]>;
  filteredDesdeOptions!: Observable<string[]>;

  readonly stepIcons = ['location_on', 'inventory_2', 'calendar_today', 'receipt_long'];

  fuelCost = 950; // Cost of fuel in ARS

  autocompleteService: any;
  geocoder: any;
  isDarkMode = true;
  mapsReady = false;
  private mapsApiReady$ = new BehaviorSubject<boolean>(false);
  private fleteCalculated = false;
  fleteData: any = null;
  isCalculating: boolean = false;
  private googleMapsLoaded: Promise<void>;
  private resolveGoogleMapsLoaded!: () => void;

  displayedColumns: string[] = ['nombre', 'largo', 'ancho', 'alto', 'peso', 'acciones'];
  dataSource = new BehaviorSubject<any[]>([]);

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private _formBuilder: FormBuilder,
    private _snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    public dialog: MatDialog
  ) {
    this.googleMapsLoaded = new Promise<void>((resolve) => {
      this.resolveGoogleMapsLoaded = resolve;
    });
  }

  ngOnInit() {
    this.firstFormGroup = this._formBuilder.group({
      destino: [{ value: '', disabled: true }, Validators.required],
      desde: [{ value: '', disabled: true }, Validators.required],
    });
    this.secondFormGroup = this._formBuilder.group({
      tipoEnvio: ['mudanza', Validators.required],
      cantidadArticulos: [0], // Initialize with 0
      articulos: this._formBuilder.array([])
    });
    this.onTipoEnvioChange('mudanza'); // Set initial state

    // Lógica para la fecha y hora
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    now.setHours(now.getHours() + 1);
    let minutes = now.getMinutes();
    if (minutes > 15 && minutes < 45) {
      minutes = 30;
    } else if (minutes <= 15) {
      minutes = 0;
    } else {
      now.setHours(now.getHours() + 1);
      minutes = 0;
    }
    now.setMinutes(minutes);
    const hours = now.getHours().toString().padStart(2, '0');
    const finalMinutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${finalMinutes}`;

    this.thirdFormGroup = this._formBuilder.group({
      fecha: [new Date(), Validators.required],
      horario: [null, [Validators.required, timeFormatValidator]],
      distancia: [0],
    });

    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.toggle('dark-theme', this.isDarkMode);
      this.loadGoogleMapsScript();
      this.googleMapsLoaded.then(() => {
        this.initializeGoogleMaps();
      });

      this.mapsApiReady$.subscribe(ready => {
        if (ready) {
          this.firstFormGroup.get('destino')?.enable();
          this.firstFormGroup.get('desde')?.enable();
          this.mapsReady = true;
          this.cdr.detectChanges();
        }
      });
    }

    this.firstFormGroup.get('destino')?.valueChanges.subscribe(() => {
      this.resetCotizacion();
    });

    this.firstFormGroup.get('desde')?.valueChanges.subscribe(() => {
      this.resetCotizacion();
    });

    this.secondFormGroup.get('tipoEnvio')?.valueChanges.subscribe(value => {
      this.onTipoEnvioChange(value);
    });

    this.secondFormGroup.get('cantidadArticulos')?.valueChanges.subscribe(cantidad => {
      if (this.secondFormGroup.get('tipoEnvio')?.value === 'articulos') {
        this.updateArticulosArray(cantidad);
      }
    });
  }

  onTipoEnvioChange(tipo: string) {
    const cantidadArticulos = this.secondFormGroup.get('cantidadArticulos');
    const articulos = this.secondFormGroup.get('articulos') as FormArray;

    if (tipo === 'mudanza') {
      articulos.clear();
      this.dataSource.next([]);
      cantidadArticulos?.clearValidators();
      cantidadArticulos?.setValue(0);
    } else { // 'articulos'
      cantidadArticulos?.setValidators([Validators.required, Validators.min(0)]);
      cantidadArticulos?.setValue(0);
      this.updateArticulosArray(0);
    }
    cantidadArticulos?.updateValueAndValidity();
  }

  onStepChange(event: any) {
    if (event.selectedIndex === 3) {
      this.calculateFlete();
    }
  }

  resetCotizacion() {
    this.fleteData = null;
    this.fleteCalculated = false;
    this.cdr.detectChanges();
  }

  ngAfterViewInit() {
    // No longer needed here, moved to ngOnInit after maps are loaded
  }

  get articulos(): FormArray {
    return this.secondFormGroup.get('articulos') as FormArray;
  }

  createArticuloFormGroup(): FormGroup {
    return this._formBuilder.group({
      nombre: ['', Validators.required],
      largo: ['', [Validators.required, Validators.min(1)]],
      ancho: ['', [Validators.required, Validators.min(1)]],
      alto: ['', [Validators.required, Validators.min(1)]],
      peso: ['', [Validators.required, Validators.min(0.1)]]
    });
  }

  updateArticulosArray(cantidad: number) {
    const articulos = this.secondFormGroup.get('articulos') as FormArray;
    const currentSize = articulos.length;

    if (cantidad > currentSize) {
        for (let i = currentSize; i < cantidad; i++) {
            articulos.push(this.createArticuloFormGroup());
        }
    } else if (cantidad < currentSize) {
        for (let i = currentSize; i > cantidad; i--) {
            articulos.removeAt(i - 1);
        }
    }
  }

  addArticulo() {
    const articuloForm = this._formBuilder.group({
      nombre: ['', Validators.required],
      largo: ['', [Validators.required, Validators.min(1)]],
      ancho: ['', [Validators.required, Validators.min(1)]],
      alto: ['', [Validators.required, Validators.min(1)]],
      peso: ['', [Validators.required, Validators.min(0.1)]]
    });
    this.articulos.push(articuloForm);
  }

  removeArticulo(index: number) {
    this.articulos.removeAt(index);
    this.dataSource.next(this.articulos.value);
    const cantidadArticulos = this.secondFormGroup.get('cantidadArticulos');
    cantidadArticulos?.setValue(this.articulos.length);
  }

  openArticleDialog(): void {
    const dialogRef = this.dialog.open(ArticleDialogComponent, {
      width: '400px',
      data: {}
    });

    dialogRef.afterClosed().subscribe((result: any) => {
      if (result) {
        const articulos = this.secondFormGroup.get('articulos') as FormArray;
        articulos.push(this._formBuilder.group(result));
        this.dataSource.next(articulos.value);
        const cantidadArticulos = this.secondFormGroup.get('cantidadArticulos');
        cantidadArticulos?.setValue(articulos.length);
      }
    });
  }

  updateQuantity(change: number) {
    const control = this.secondFormGroup.get('cantidadArticulos');
    if (control) {
      const currentQuantity = control.value;
      const newQuantity = currentQuantity + change;
      if (newQuantity >= 1 && newQuantity <= 5) {
        control.setValue(newQuantity);
      }
    }
  }

  loadGoogleMapsScript() {
    if (typeof google !== 'undefined' && google.maps && typeof google.maps.importLibrary === 'function') {
      this.resolveGoogleMapsLoaded();
      return;
    }
    (window as any).initMap = () => {
      this.resolveGoogleMapsLoaded();
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&loading=async&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  async initializeGoogleMaps() {
    try {
      const { Geocoder } = await google.maps.importLibrary('geocoding');
      this.geocoder = new Geocoder();
      this.mapsApiReady$.next(true);
      this.mapsApiReady$.complete();

      this.filteredDestinoOptions = this.firstFormGroup.get('destino')!.valueChanges.pipe(
        startWith(''),
        debounceTime(300),
        switchMap((value) => (value ? this._searchPlaces(value) : of([]))),
        catchError(() => of([]))
      );

      this.filteredDesdeOptions = this.firstFormGroup.get('desde')!.valueChanges.pipe(
        startWith(''),
        debounceTime(300),
        switchMap((value) => (value ? this._searchPlaces(value) : of([]))),
        catchError(() => of([]))
      );

      this.firstFormGroup.get('destino')?.enable();
      this.firstFormGroup.get('desde')?.enable();
      this.mapsReady = true;
      this.cdr.detectChanges();

    } catch (error) {
      console.error('Error loading Google Maps libraries:', error);
    }
  }

  validateAddress(controlName: string) {
    const control = this.firstFormGroup.get(controlName);
    const address = control?.value;

    if (address && address.length > 0) {
      this.validateAddressWithApi(address).then(response => {
        if (response && response.result && response.result.verdict && response.result.verdict.addressComplete !== false && response.result.address.formattedAddress) {
          // Address is valid, update the input with the formatted address
          control?.setValue(response.result.address.formattedAddress, { emitEvent: false });
          this._snackBar.open('Dirección corregida automáticamente.', 'Cerrar', { duration: 3000 });

          if (control?.hasError('invalidAddress')) {
            const errors = { ...control.errors };
            delete errors['invalidAddress'];
            control.setErrors(Object.keys(errors).length > 0 ? errors : null);
          }
        } else {
          // Address is not valid
          control?.setErrors({ ...control.errors, 'invalidAddress': true });
        }
        this.cdr.detectChanges();
      });
    } else {
        if (control?.hasError('invalidAddress')) {
            const errors = { ...control.errors };
            delete errors['invalidAddress'];
            control.setErrors(Object.keys(errors).length > 0 ? errors : null);
        }
    }
  }

  async validateAddressWithApi(address: string): Promise<any> {
    const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${environment.googleAddressValidationApiKey}`;
    const body = {
      address: {
        regionCode: 'AR',
        languageCode: 'es',
        addressLines: [address]
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const responseData = await response.json();
      console.log('Response from Google Address Validation API:', responseData);
      return responseData;
    } catch (error) {
      console.error('Error validating address with Google API:', error);
      return null;
    }
  }

  private _searchPlaces(query: string | google.maps.LatLng): Observable<string[]> {
    if (!query) {
      return of([]);
    }

    return new Observable(observer => {
      if (typeof query === 'string') {
        google.maps.importLibrary("places").then(({ Place }: { Place: any }) => {
          const request = {
            textQuery: query,
            fields: ['displayName'],
            locationBias: new google.maps.LatLng(-34.6037, -58.3816), // Buenos Aires
            language: 'es',
            region: 'ar',
          };
          return Place.searchByText(request);
        }).then((response: any) => {
          const placeNames = response.places ? response.places.map((p: any) => p.displayName) : [];
          observer.next(placeNames);
          observer.complete();
        }).catch((err: any) => {
          console.error('Error searching places:', err);
          observer.next([]);
          observer.complete();
        });
      } else {
        this.geocoder.geocode({ location: query }, (results: any, status: any) => {
          if (status === google.maps.GeocoderStatus.OK && results[0]) {
            observer.next([results[0].formatted_address]);
            observer.complete();
          } else {
            observer.next([]);
            observer.complete();
          }
        });
      }
    });
  }

  onDestinoSelected(event: any) {
    this.firstFormGroup.get('desde')?.enable();
  }

  getCurrentLocation() {
    if (navigator.geolocation) {
      this._snackBar.open('Obteniendo ubicación actual...', undefined, { duration: 2000 });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.reverseGeocode(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          let errorMessage = 'Ocurrió un error desconocido al obtener la ubicación.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Permiso de geolocalización denegado.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'La información de ubicación no está disponible.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Se agotó el tiempo de espera para obtener la ubicación.';
              break;
          }
          this._snackBar.open(errorMessage, 'Cerrar', { duration: 3000 });
          console.error(`Error getting location: ${errorMessage}. Code: ${error.code}. Message: ${error.message}`);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    } else {
      this._snackBar.open('Geolocalización no soportada en este navegador', 'Cerrar', { duration: 3000 });
    }
  }
  
  reverseGeocode(latitude: number, longitude: number) {
    const latlng = new google.maps.LatLng(latitude, longitude);
    this._searchPlaces(latlng).subscribe(results => {
      if (results.length > 0) {
        this.firstFormGroup.patchValue({ desde: results[0] });
        this._snackBar.open('Ubicación actual obtenida', 'Cerrar', { duration: 3000 });
      } else {
        this._snackBar.open('No se pudo obtener la dirección', 'Cerrar', { duration: 3000 });
      }
    });
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle('dark-theme', this.isDarkMode);
  }

  calculateFlete() {
    if (this.isCalculating) {
      return;
    }

    this.isCalculating = true;
    this.fleteData = null;
    this.cdr.detectChanges();

    const desde = this.firstFormGroup.value.desde;
    const destino = this.firstFormGroup.value.destino;

    if (!desde || !destino) {
      this._snackBar.open('Por favor, ingrese un origen y un destino válidos.', 'Cerrar', { duration: 3000 });
      this.isCalculating = false;
      this.cdr.detectChanges();
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const request = {
      origin: desde,
      destination: destino,
      travelMode: google.maps.TravelMode.DRIVING
    };

    const calculationTimeout = 15000; // 15 seconds

    const directionsPromise = new Promise((resolve, reject) => {
        directionsService.route(request, (result: any, status: any) => {
            if (status === 'OK') {
                resolve(result);
            } else {
                reject(status);
            }
        });
    });

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject('TIMEOUT');
        }, calculationTimeout);
    });

    Promise.race([directionsPromise, timeoutPromise])
        .then((result: any) => {
            const route = result.routes[0];
            const distancia = route.legs[0].distance.value / 1000; // en km

            const fecha = this.thirdFormGroup.value.fecha;
            const horario = this.thirdFormGroup.value.horario;

            if (!fecha || !horario) {
              this._snackBar.open('Por favor, seleccione una fecha y un horario.', 'Cerrar', { duration: 3000 });
              this.isCalculating = false;
              this.cdr.detectChanges();
              return;
            }

            // --- Lógica de cálculo unificada ---
            const basePrice = 3000;
            const distancePrice = (distancia / 10) * this.fuelCost;
            const serviceMultiplier = this.secondFormGroup.value.tipoEnvio === 'mudanza' ? 1.5 : 1.0;

            let articleCosts = 0;
            if (this.secondFormGroup.value.tipoEnvio === 'articulos' && this.secondFormGroup.value.articulos?.length > 0) {
              this.secondFormGroup.value.articulos.forEach((article: any) => {
                const largo = parseFloat(article.largo) || 0;
                const ancho = parseFloat(article.ancho) || 0;
                const alto = parseFloat(article.alto) || 0;
                const peso = parseFloat(article.peso) || 0;
                const volume = (largo * ancho * alto) / 1000000;
                const weightCost = peso * 100;
                const volumeCost = volume * 5000;
                articleCosts += Math.max(weightCost, volumeCost);
              });
            }

            let dateTimeMultiplier = 1.0;
            const today = new Date();
            let selectedDate = new Date(fecha);

            // Asegurarse de que el horario es una cadena de texto
            const horarioStr = String(horario);

            const [hours, minutes] = horarioStr.split(':');
            selectedDate = setHours(selectedDate, parseInt(hours, 10));
            selectedDate = setMinutes(selectedDate, parseInt(minutes, 10));

            const daysDifference = differenceInDays(selectedDate, today);
            if (daysDifference <= 1) {
              dateTimeMultiplier = 1.5;
            } else if (daysDifference <= 3) {
              dateTimeMultiplier = 1.2;
            }

            const selectedHour = parseInt(hours, 10);
            if (selectedHour >= 6 && selectedHour <= 8) {
              dateTimeMultiplier *= 1.1;
            } else if (selectedHour >= 18 && selectedHour <= 20) {
              dateTimeMultiplier *= 1.15;
            }

            const subtotal = (basePrice + distancePrice + articleCosts) * serviceMultiplier * dateTimeMultiplier;
            const iva = subtotal * 0.21;
            const total = subtotal + iva;

            this.fleteData = {
              distancia: distancia,
              basePrice: Math.round(basePrice),
              distancePrice: Math.round(distancePrice),
              articleCosts: Math.round(articleCosts),
              serviceMultiplier: serviceMultiplier,
              dateTimeMultiplier: Math.round(dateTimeMultiplier * 100) / 100,
              subtotal: Math.round(subtotal),
              iva: Math.round(iva),
              total: Math.round(total)
            };
            
            this.fleteCalculated = true;
            this.isCalculating = false;
            this.cdr.detectChanges();
        })
        .catch(status => {
            if (status === 'TIMEOUT') {
                this._snackBar.open('El cálculo de la ruta ha tardado demasiado. Por favor, intente de nuevo.', 'Cerrar', { duration: 5000 });
                this.stepper.reset();
            } else {
                console.error('Error al calcular la ruta:', status);
                this._snackBar.open('No se pudo calcular la ruta. Verifique las direcciones e intente de nuevo.', 'Cerrar', { duration: 5000 });
                this.stepper.reset();
            }
            this.isCalculating = false;
            this.cdr.detectChanges();
        });
  }

  calcularCostoTotal(distancia: number, duracion: number, fecha: Date, costoPeajes: number, ayudantes: number, costoBase: number): number {
    // Lógica de cálculo de costos
    const costoDistancia = distancia * 50; // $50 por km
    const costoDuracion = duracion * 10; // $10 por minuto
    const costoAyudantes = ayudantes * 1500; // $1500 por ayudante

    let recargoHorario = 1;
    const hora = fecha.getHours();
    if (hora >= 20 || hora < 6) { // Horario nocturno
      recargoHorario = 1.25;
    }

    let recargoFinDeSemana = 1;
    const dia = fecha.getDay();
    if (dia === 0 || dia === 6) { // Domingo o Sábado
      recargoFinDeSemana = 1.2;
    }

    const costoTotal = (costoBase + costoDistancia + costoDuracion + costoAyudantes + costoPeajes) * recargoHorario * recargoFinDeSemana;
    return costoTotal;
  }

  calculateDistance(): Promise<number> {
    return new Promise((resolve, reject) => {
      const service = new google.maps.DistanceMatrixService();
      service.getDistanceMatrix({
        origins: [this.firstFormGroup.value.desde],
        destinations: [this.firstFormGroup.value.destino],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false
      }, (response: any, status: any) => {
        if (status === google.maps.DistanceMatrixStatus.OK) {
          const element = response.rows[0].elements[0];
          if (element.status === 'OK') {
            resolve(element.distance.value / 1000);
          } else {
            reject(new Error('No se pudo calcular la distancia.'));
          }
        } else {
          reject(new Error('Error en el cálculo de distancia.'));
        }
      });
    });
  }

  handleDistanceError(message: string) {
    this.isCalculating = false;
    this._snackBar.open(message, 'Cerrar', { duration: 3000 });
    this.stepper.selectedIndex = 0; // Redirigir al primer paso
    this.cdr.detectChanges();
  }

  generateFlete(distance: number) {
    const basePrice = 3000;
    const distancePrice = (distance / 10) * this.fuelCost;
    const serviceMultiplier = this.secondFormGroup.value.tipoEnvio === 'mudanza' ? 1.5 : 1.0;
    const articleCosts = this.calculateArticleCosts();
    const dateTimeMultiplier = this.calculateDateTimeMultiplier();

    const subtotal = (basePrice + distancePrice + articleCosts) * serviceMultiplier * dateTimeMultiplier;
    const iva = subtotal * 0.21;
    const total = subtotal + iva;

    this.displayFlete({
      distancia: distance,
      basePrice: Math.round(basePrice),
      distancePrice: Math.round(distancePrice),
      articleCosts: Math.round(articleCosts),
      serviceMultiplier: serviceMultiplier,
      dateTimeMultiplier: Math.round(dateTimeMultiplier * 100) / 100,
      subtotal: Math.round(subtotal),
      iva: Math.round(iva),
      total: Math.round(total)
    });
  }

  calculateArticleCosts(): number {
    let articleCosts = 0;
    if (this.secondFormGroup.value.articulos && this.secondFormGroup.value.articulos.length > 0) {
      this.secondFormGroup.value.articulos.forEach((article: any) => {
        const volume = (article.largo * article.ancho * article.alto) / 1000000;
        const weightCost = article.peso * 100;
        const volumeCost = volume * 5000;
        articleCosts += Math.max(weightCost, volumeCost);
      });
    }
    return articleCosts;
  }

  calculateDateTimeMultiplier(): number {
    let dateTimeMultiplier = 1.0;
    const today = new Date();
    let selectedDate = new Date(this.thirdFormGroup.value.fecha);
    const [hours, minutes] = this.thirdFormGroup.value.horario.split(':');
    selectedDate = setHours(selectedDate, parseInt(hours, 10));
    selectedDate = setMinutes(selectedDate, parseInt(minutes, 10));

    const daysDifference = differenceInDays(selectedDate, today);
    if (daysDifference <= 1) {
      dateTimeMultiplier = 1.5;
    } else if (daysDifference <= 3) {
      dateTimeMultiplier = 1.2;
    }

    const selectedHour = parseInt(this.thirdFormGroup.value.horario.split(':')[0], 10);
    if (selectedHour >= 6 && selectedHour <= 8) {
      dateTimeMultiplier *= 1.1;
    } else if (selectedHour >= 18 && selectedHour <= 20) {
      dateTimeMultiplier *= 1.15;
    }
    return dateTimeMultiplier;
  }

  displayFlete(fleteData: any) {
    console.log('Flete data:', fleteData);
    this.fleteData = fleteData;
    this.isCalculating = false;
    this.cdr.detectChanges(); // Forzar la detección de cambios
  }

  handleSubmit(event: Event) {
    event.preventDefault();
    this.calculateFlete();
  }

  resetForm() {
    this.firstFormGroup.reset();
    this.secondFormGroup.reset();
    this.thirdFormGroup.reset();
    this.firstFormGroup.get('desde')?.disable();
    this.fleteData = null;
    this.fleteCalculated = false;
    this.stepper.reset();
    this.cdr.detectChanges(); // Forzar la detección de cambios
  }
}
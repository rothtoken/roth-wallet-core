import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import * as _ from 'lodash';

// providers
import { ConfigProvider } from '../config/config';
import { HomeIntegrationsProvider } from '../home-integrations/home-integrations';
import { Logger } from '../logger/logger';
import { PlatformProvider } from '../platform/platform';
import { SimplexProvider } from '../simplex/simplex';
import { WyreProvider } from '../wyre/wyre';

@Injectable()
export class BuyCryptoProvider {
  public paymentMethodsAvailable;
  public exchangeCoinsSupported: string[];

  // private baseUrl: string = 'http://localhost:3232/bws/api'; // testing
  private baseUrl: string = 'https://bws.roth.com/bws/api';

  constructor(
    private http: HttpClient,
    private configProvider: ConfigProvider,
    private homeIntegrationsProvider: HomeIntegrationsProvider,
    private logger: Logger,
    private translate: TranslateService,
    private simplexProvider: SimplexProvider,
    private wyreProvider: WyreProvider,
    private platformProvider: PlatformProvider
  ) {
    this.logger.debug('BuyCrypto Provider initialized');

    this.exchangeCoinsSupported = _.union(
      this.simplexProvider.supportedCoins,
      this.wyreProvider.supportedCoins
    );
    this.paymentMethodsAvailable = {
      applePay: {
        label: this.translate.instant('Apple Pay'),
        method: 'applePay',
        imgSrc: 'assets/img/buy-crypto/apple-pay-logo.svg',
        supportedExchanges: {
          simplex: true,
          wyre: true
        },
        enabled: this.platformProvider.isIOS
      },
      sepaBankTransfer: {
        label: this.translate.instant('SEPA Bank Transfer'),
        method: 'sepaBankTransfer',
        imgSrc: 'assets/img/buy-crypto/icon-bank.svg',
        supportedExchanges: {
          simplex: true, // EU Only
          wyre: false
        },
        enabled: true
      },
      creditCard: {
        label: this.translate.instant('Credit Card'),
        method: 'creditCard',
        imgSrc: 'assets/img/buy-crypto/icon-creditcard.svg',
        supportedExchanges: {
          simplex: true,
          wyre: false
        },
        enabled: true
      },
      debitCard: {
        label: this.translate.instant('Debit Card'),
        method: 'debitCard',
        imgSrc: 'assets/img/buy-crypto/icon-debitcard.svg',
        supportedExchanges: {
          simplex: true,
          wyre: true
        },
        enabled: true
      }
    };
  }

  public register(): void {
    this.homeIntegrationsProvider.register({
      name: 'buycrypto',
      title: this.translate.instant('Buy Crypto'),
      icon: 'assets/img/icon-coins.svg',
      showIcon: true,
      logo: null,
      logoWidth: '110',
      background:
        'linear-gradient(to bottom,rgba(60, 63, 69, 1) 0,rgba(45, 47, 51, 1) 100%)',
      page: 'CryptoSettingsPage',
      show: !!this.configProvider.get().showIntegration['buycrypto'],
      type: 'exchange'
    });
  }

  private isCurrencySupported(exchange: string, currency: string): boolean {
    switch (exchange) {
      case 'simplex':
        return _.includes(
          this.simplexProvider.supportedFiatAltCurrencies,
          currency.toUpperCase()
        );
      case 'wyre':
        return _.includes(
          this.wyreProvider.supportedFiatAltCurrencies,
          currency.toUpperCase()
        );
      default:
        return false;
    }
  }

  private isCoinSupported(exchange: string, coin: string) {
    switch (exchange) {
      case 'simplex':
        return _.includes(this.simplexProvider.supportedCoins, coin);
      case 'wyre':
        return _.includes(this.wyreProvider.supportedCoins, coin);
      default:
        return false;
    }
  }

  public isPaymentMethodSupported(
    exchange: string,
    paymentMethod,
    coin: string,
    currency: string
  ): boolean {
    return (
      paymentMethod.supportedExchanges[exchange] &&
      this.isCoinSupported(exchange, coin) &&
      this.isCurrencySupported(exchange, currency)
    );
  }

  public async getPaymentRequests(): Promise<any> {
    const [
      simplexPaymentRequests,
      wyrePaymentRequests
    ]: any = await Promise.all([
      this.simplexProvider.getSimplex(),
      this.wyreProvider.getWyre()
    ]);
    return {
      simplexPaymentRequests: _.values(simplexPaymentRequests),
      wyrePaymentRequests: _.values(wyrePaymentRequests)
    };
  }

  public getExchangeCoinsSupported(exchange?: string): string[] {
    switch (exchange) {
      case 'simplex':
        return this.simplexProvider.supportedCoins;
      case 'wyre':
        return this.wyreProvider.supportedCoins;
      default:
        // return all supported coins
        return this.exchangeCoinsSupported;
    }
  }

  public isPromotionActive(promo: string): Promise<boolean> {
    return new Promise(resolve => {
      this.getActiveBuyCryptoPromotions()
        .then(data => {
          if (!data) return resolve(false);
          switch (promo) {
            case 'simplexPromotion202002':
              return resolve(data.simplexPromotion202002);
            default:
              return resolve(false);
          }
        })
        .catch(err => {
          this.logger.error(
            `Error trying isPromotionActive: ${promo}. Setting false.`
          );
          this.logger.error(err);
          return resolve(false);
        });
    });
  }

  public getActiveBuyCryptoPromotions(): Promise<any> {
    return new Promise((resolve, reject) => {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json'
      });

      this.logger.debug('Asking BWS for active promotions');

      this.http
        .get(this.baseUrl + '/v1/services', {
          headers
        })
        .subscribe(
          (data: any) => {
            this.logger.debug('Active promotions: ', data);
            if (data && data.buyCrypto) return resolve(data.buyCrypto);
            return reject('No active promotions for buy crypto');
          },
          err => {
            return reject(err);
          }
        );
    });
  }
}

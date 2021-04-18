import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Logger } from '../../providers/logger/logger';

// providers
import { BwcProvider } from '../../providers/bwc/bwc';
import { ConfigProvider } from '../../providers/config/config';

import * as _ from 'lodash';

@Injectable()
export class FeeProvider {
  private CACHE_TIME_TS: number = 60;
  private cache: [
    {
      updateTs: number;
      coin: string;
      network: string;
      data?: any;
    }
  ] = [
    {
      updateTs: 0,
      coin: '',
      network: 'livenet'
    }
  ];

  constructor(
    private configProvider: ConfigProvider,
    private logger: Logger,
    private bwcProvider: BwcProvider,
    private translate: TranslateService
  ) {
    this.logger.debug('FeeProvider initialized');
  }

  public getFeeOpts() {
    const feeOpts = {
      urgent: this.translate.instant('Urgent'),
      priority: this.translate.instant('Priority'),
      normal: this.translate.instant('Normal'),
      economy: this.translate.instant('Economy'),
      superEconomy: this.translate.instant('Super Economy'),
      custom: this.translate.instant('Custom')
    };
    return feeOpts;
  }

  public getCoinCurrentFeeLevel(coin): string {
    let feeLevel;
    switch (coin) {
      case 'bch':
        feeLevel = 'normal';
        break;
      case 'xrp':
        feeLevel = 'normal';
        break;
      default:
        feeLevel =
          this.configProvider.get().wallet.settings.feeLevel || 'normal';
        break;
    }
    return feeLevel;
  }

  public getCurrentFeeLevel(): string {
    return this.configProvider.get().wallet.settings.feeLevel || 'normal';
  }

  public getFeeRate(
    coin: string,
    network: string,
    feeLevel: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (feeLevel == 'custom') return resolve();
      network = network || 'livenet';
      this.getFeeLevels(coin, network)
        .then(response => {
          let feeLevelRate;
          feeLevelRate = _.find(response.levels, o => {
            return o.level == feeLevel;
          });
          if (!feeLevelRate || !feeLevelRate.feePerKb) {
            let msg =
              this.translate.instant('Could not get dynamic fee for level:') +
              ' ' +
              feeLevel;
            return reject(msg);
          }

          let feeRate = feeLevelRate.feePerKb;
          if (!response.fromCache)
            this.logger.debug(
              'Dynamic fee: ' +
                feeLevel +
                '/' +
                network +
                ' ' +
                (feeLevelRate.feePerKb / 1000).toFixed() +
                ' SAT/B'
            );
          return resolve(feeRate);
        })
        .catch(err => {
          return reject(err);
        });
    });
  }

  public getFeeLevels(coin: string, network: string): Promise<any> {
    return new Promise((resolve, reject) => {
      coin = coin || 'btc';
      const indexFound = this.cache.findIndex(
        fl => fl.coin == coin && fl.network == network
      );
      if (
        indexFound >= 0 &&
        this.cache[indexFound].updateTs > Date.now() - this.CACHE_TIME_TS * 1000
      ) {
        return resolve({
          levels: this.cache[indexFound].data,
          fromCache: true
        });
      }

      let walletClient = this.bwcProvider.getClient(null, {});

      walletClient.getFeeLevels(coin, network, (errLivenet, feeLevels) => {
        if (errLivenet) {
          return reject(this.translate.instant('Could not get dynamic fee'));
        }

        if (indexFound >= 0) {
          this.cache[indexFound] = {
            updateTs: Date.now(),
            coin,
            network,
            data: feeLevels
          };
        } else {
          this.cache.push({
            updateTs: Date.now(),
            coin,
            network,
            data: feeLevels
          });
        }
        return resolve({ levels: feeLevels });
      });
    });
  }

  public getSpeedUpTxFee(network: string, txSize: number): Promise<number> {
    // Only for BTC
    return this.getFeeRate('btc', network, 'urgent').then(urgentFee => {
      // 250 bytes approx. is the minimum size of a tx with 1 input and 1 output
      const averageTxSize = 250;
      const fee = (urgentFee / 1000) * (txSize + averageTxSize);
      this.logger.debug(
        'Fee needed to speed up the tx: ' + Number(fee.toFixed())
      );
      return Number(fee.toFixed());
    });
  }
}

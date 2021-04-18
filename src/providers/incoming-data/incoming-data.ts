import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Events } from 'ionic-angular';
import * as _ from 'lodash';

// providers
import { ActionSheetProvider } from '../action-sheet/action-sheet';
import { AnalyticsProvider } from '../analytics/analytics';
import { AppProvider } from '../app/app';
import { rothIdProvider } from '../roth-id/roth-id';
import { BwcProvider } from '../bwc/bwc';
import { Coin, CurrencyProvider } from '../currency/currency';
import { ExternalLinkProvider } from '../external-link/external-link';
import { IABCardProvider } from '../in-app-browser/card';
import { Logger } from '../logger/logger';
import { OnGoingProcessProvider } from '../on-going-process/on-going-process';
import { PayproProvider } from '../paypro/paypro';
import { PersistenceProvider } from '../persistence/persistence';
import { ProfileProvider } from '../profile/profile';

export interface RedirParams {
  activePage?: any;
  amount?: string;
  coin?: Coin;
  fromHomeCard?: boolean;
}

@Injectable()
export class IncomingDataProvider {
  private activePage: string;

  constructor(
    private actionSheetProvider: ActionSheetProvider,
    private events: Events,
    private bwcProvider: BwcProvider,
    private currencyProvider: CurrencyProvider,
    private externalLinkProvider: ExternalLinkProvider,
    private payproProvider: PayproProvider,
    private logger: Logger,
    private analyticsProvider: AnalyticsProvider,
    private appProvider: AppProvider,
    private translate: TranslateService,
    private profileProvider: ProfileProvider,
    private onGoingProcessProvider: OnGoingProcessProvider,
    private iabCardProvider: IABCardProvider,
    private persistenceProvider: PersistenceProvider,
    private rothIdProvider: rothIdProvider
  ) {
    this.logger.debug('IncomingDataProvider initialized');
    this.events.subscribe('unlockInvoice', paymentUrl =>
      this.handleUnlock(paymentUrl)
    );
  }

  public showMenu(data): void {
    const dataMenu = this.actionSheetProvider.createIncomingDataMenu({ data });
    dataMenu.present();
    dataMenu.onDidDismiss(data => this.finishIncomingData(data));
  }

  public finishIncomingData(data: any): void {
    let nextView = {};
    if (data) {
      const stateParams = {
        addressbookEntry:
          data.redirTo == 'AddressbookAddPage' ? data.value : null,
        toAddress: data.redirTo == 'AmountPage' ? data.value : null,
        coin: data.coin ? data.coin : 'btc',
        privateKey: data.redirTo == 'PaperWalletPage' ? data.value : null
      };
      nextView = {
        name: data.redirTo,
        params: stateParams
      };
    }
    this.incomingDataRedir(nextView);
  }

  private isValidPayPro(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!/^(bitcoin|bitcoincash|bchtest|ethereum|ripple|dogecoin)?:\?r=[\w+]/.exec(
      data
    );
  }

  private isValidrothInvoice(data: string): boolean {
    return !!/^https:\/\/(www.)?(test.|staging.)?roth.com\/i\/\w+/.exec(data);
  }

  private isValidrothUri(data: string): boolean {
    data = this.sanitizeUri(data);
    if (!(data && data.indexOf('roth:') === 0)) return false;
    const address = this.extractAddress(data);
    if (!address) return false;
    let params: URLSearchParams = new URLSearchParams(
      data.replace(`roth:${address}`, '')
    );
    const coin = params.get('coin');
    if (!coin) return false;
    return true;
  }

  private isValidBitcoinUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider.getBitcore().URI.isValid(data);
  }

  private isValidBitcoinCashUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider.getBitcoreCash().URI.isValid(data);
  }

  private isValidEthereumUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider.getCore().Validation.validateUri('ETH', data);
  }

  private isValidRippleUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider.getCore().Validation.validateUri('XRP', data);
  }

  private isValidDogecoinUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider.getBitcoreDoge().URI.isValid(data);
  }

  private isValidWalletConnectUri(data: string): boolean {
    return !!/^(wc)?:/.exec(data);
  }

  public isValidBitcoinCashUriWithLegacyAddress(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!this.bwcProvider
      .getBitcore()
      .URI.isValid(data.replace(/^(bitcoincash:|bchtest:)/, 'bitcoin:'));
  }

  private isValidPlainUrl(data: string): boolean {
    if (this.isValidrothInvoice(data)) {
      return false;
    }
    data = this.sanitizeUri(data);
    return !!/^https?:\/\//.test(data);
  }

  private isValidBitcoinAddress(data: string): boolean {
    return !!(
      this.bwcProvider.getBitcore().Address.isValid(data, 'livenet') ||
      this.bwcProvider.getBitcore().Address.isValid(data, 'testnet')
    );
  }

  public isValidBitcoinCashLegacyAddress(data: string): boolean {
    return !!(
      this.bwcProvider.getBitcore().Address.isValid(data, 'livenet') ||
      this.bwcProvider.getBitcore().Address.isValid(data, 'testnet')
    );
  }

  private isValidBitcoinCashAddress(data: string): boolean {
    return !!(
      this.bwcProvider.getBitcoreCash().Address.isValid(data, 'livenet') ||
      this.bwcProvider.getBitcoreCash().Address.isValid(data, 'testnet')
    );
  }

  private isValidEthereumAddress(data: string): boolean {
    return !!this.bwcProvider
      .getCore()
      .Validation.validateAddress('ETH', 'livenet', data);
  }

  private isValidRippleAddress(data: string): boolean {
    return !!this.bwcProvider
      .getCore()
      .Validation.validateAddress('XRP', 'livenet', data);
  }

  private isValidDogecoinAddress(data: string): boolean {
    return !!(
      this.bwcProvider.getBitcoreDoge().Address.isValid(data, 'livenet') ||
      this.bwcProvider.getBitcoreDoge().Address.isValid(data, 'testnet')
    );
  }

  private isValidCoinbaseUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(
      data && data.indexOf(this.appProvider.info.name + '://coinbase') === 0
    );
  }

  private isValidSimplexUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(
      data && data.indexOf(this.appProvider.info.name + '://simplex') === 0
    );
  }

  private isValidWyreUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(
      data &&
      (data.indexOf(this.appProvider.info.name + '://wyre') === 0 ||
        data.indexOf(this.appProvider.info.name + '://wyreError') === 0)
    );
  }

  private isValidInvoiceUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(
      data && data.indexOf(this.appProvider.info.name + '://invoice') === 0
    );
  }

  private isValidrothCardUri(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(data && data.indexOf('roth://roth') === 0);
  }

  private isValidrothRedirLink(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(data && data.indexOf('roth://landing') === 0);
  }

  private isValidrothDynamicLink(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(data && data.indexOf('com.roth.wallet://google/link') === 0);
  }

  private isValidJoinCode(data: string): boolean {
    data = this.sanitizeUri(data);
    return !!(data && data.match(/^roth:[0-9A-HJ-NP-Za-km-z]{70,80}$/));
  }

  private isValidJoinLegacyCode(data: string): boolean {
    return !!(data && data.match(/^[0-9A-HJ-NP-Za-km-z]{70,80}$/));
  }

  private isValidPrivateKey(data: string): boolean {
    return !!(
      data &&
      (data.substring(0, 2) == '6P' || this.checkPrivateKey(data))
    );
  }

  private isValidImportPrivateKey(data: string): boolean {
    return !!(
      data &&
      (data.substring(0, 2) == '1|' ||
        data.substring(0, 2) == '2|' ||
        data.substring(0, 2) == '3|')
    );
  }

  private handlePrivateKey(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: private key');
    this.showMenu({
      data,
      type: 'privateKey',
      fromHomeCard: redirParams ? redirParams.fromHomeCard : false
    });
  }

  private handlePayProNonBackwardsCompatible(data: string): void {
    this.logger.debug(
      'Incoming-data: Payment Protocol with non-backwards-compatible request'
    );
    const url = this.getPayProUrl(data);
    this.handlerothInvoice(url);
  }

  private async handlerothInvoice(invoiceUrl: string) {
    this.logger.debug('Incoming-data: Handling roth invoice');
    try {
      const disableLoader = true;
      const payProOptions = await this.payproProvider.getPayProOptions(
        invoiceUrl
      );

      const selected = payProOptions.paymentOptions.filter(
        option => option.selected
      );

      if (selected.length === 1) {
        // Confirm Page - selectedTransactionCurrency set to selected
        const [{ currency }] = selected;
        return this.goToPayPro(
          invoiceUrl,
          currency.toLowerCase(),
          payProOptions,
          disableLoader
        );
      } else {
        // Select Invoice Currency - No selectedTransactionCurrency set
        let hasWallets = {};
        let availableWallets = [];
        for (const option of payProOptions.paymentOptions) {
          const fundedWallets = this.profileProvider.getWallets({
            coin: option.currency.toLowerCase(),
            network: option.network,
            minAmount: option.estimatedAmount
          });
          if (fundedWallets.length === 0) {
            option.disabled = true;
          } else {
            hasWallets[option.currency.toLowerCase()] = fundedWallets.length;
            availableWallets.push(option);
          }
        }
        if (availableWallets.length === 1) {
          // Only one available wallet with balance
          const [{ currency }] = availableWallets;
          return this.goToPayPro(
            invoiceUrl,
            currency.toLowerCase(),
            payProOptions,
            disableLoader
          );
        }

        const stateParams = {
          payProOptions,
          hasWallets
        };
        let nextView = {
          name: 'SelectInvoicePage',
          params: stateParams
        };
        this.incomingDataRedir(nextView);
      }
    } catch (err) {
      this.onGoingProcessProvider.clear();
      this.events.publish('incomingDataError', err);
      this.logger.error(err);
    }
  }

  private handleDynamicLink(deepLink: string): void {
    this.logger.debug('Incoming-data: Dynamic Link ' + deepLink);
    this.persistenceProvider.setDynamicLink(deepLink);
  }

  private handlerothUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: roth URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const address = this.extractAddress(data);
    let params: URLSearchParams = new URLSearchParams(
      data.replace(`roth:${address}`, '')
    );
    let amount = params.get('amount') || amountFromRedirParams;
    const coin: Coin = Coin[params.get('coin').toUpperCase()];
    const message = params.get('message');
    const requiredFeeParam = params.get('gasPrice');
    if (amount) {
      const { unitToSatoshi } = this.currencyProvider.getPrecision(coin);
      amount = parseInt(
        (Number(amount) * unitToSatoshi).toFixed(0),
        10
      ).toString();
      this.goSend(address, amount, message, coin, requiredFeeParam);
    } else {
      this.goToAmountPage(address, coin);
    }
  }

  private handleBitcoinUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Bitcoin URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const coin = Coin.BTC;
    let parsed = this.bwcProvider.getBitcore().URI(data);
    let address = parsed.address ? parsed.address.toString() : '';
    let message = parsed.message;
    let amount = parsed.amount || amountFromRedirParams;
    if (parsed.r) {
      const payProUrl = this.getPayProUrl(parsed.r);
      this.goToPayPro(payProUrl, coin);
    } else this.goSend(address, amount, message, coin);
  }

  private handleBitcoinCashUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Bitcoin Cash URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const coin = Coin.BCH;
    let parsed = this.bwcProvider.getBitcoreCash().URI(data);
    let address = parsed.address ? parsed.address.toString() : '';

    // keep address in original format
    if (parsed.address && data.indexOf(address) < 0) {
      address = parsed.address.toCashAddress();
    }

    let message = parsed.message;
    let amount = parsed.amount || amountFromRedirParams;

    if (parsed.r) {
      const payProUrl = this.getPayProUrl(parsed.r);
      this.goToPayPro(payProUrl, coin);
    } else this.goSend(address, amount, message, coin);
  }

  private handleEthereumUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Ethereum URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const coin = Coin.ETH;
    const value = /[\?\&]value=(\d+([\,\.]\d+)?)/i;
    const gasPrice = /[\?\&]gasPrice=(\d+([\,\.]\d+)?)/i;
    let parsedAmount;
    let requiredFeeParam;
    if (value.exec(data)) {
      parsedAmount = value.exec(data)[1];
    }
    if (gasPrice.exec(data)) {
      requiredFeeParam = gasPrice.exec(data)[1];
    }
    const address = this.extractAddress(data);
    const message = '';
    const amount = parsedAmount || amountFromRedirParams;
    if (amount) {
      this.goSend(address, amount, message, coin, requiredFeeParam);
    } else {
      this.handleEthereumAddress(address, redirParams);
    }
  }

  private handleRippleUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Ripple URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const coin = Coin.XRP;
    const amountParam = /[\?\&]amount=(\d+([\,\.]\d+)?)/i;
    const tagParam = /[\?\&]dt=(\d+([\,\.]\d+)?)/i;
    let parsedAmount;
    let destinationTag;
    let requiredFeeRate;
    if (amountParam.exec(data)) {
      const { unitToSatoshi } = this.currencyProvider.getPrecision(coin);
      parsedAmount = (
        Number(amountParam.exec(data)[1]) * unitToSatoshi
      ).toString();
    }
    if (tagParam.exec(data)) {
      destinationTag = tagParam.exec(data)[1];
    }
    const address = this.extractAddress(data);
    const message = '';
    const amount = parsedAmount || amountFromRedirParams;
    if (amount) {
      this.goSend(
        address,
        amount,
        message,
        coin,
        requiredFeeRate,
        destinationTag
      );
    } else {
      this.handleRippleAddress(address, redirParams);
    }
  }

  private handleDogecoinUri(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Dogecoin URI');
    let amountFromRedirParams =
      redirParams && redirParams.amount ? redirParams.amount : '';
    const coin = Coin.DOGE;
    let parsed = this.bwcProvider.getBitcoreDoge().URI(data);
    let address = parsed.address ? parsed.address.toString() : '';
    let message = parsed.message;
    let amount = parsed.amount || amountFromRedirParams;
    if (parsed.r) {
      const payProUrl = this.getPayProUrl(parsed.r);
      this.goToPayPro(payProUrl, coin);
    } else this.goSend(address, amount, message, coin);
  }

  private handleWalletConnectUri(uri: string): void {
    // Disable Wallet Connect
    if (!this.appProvider.info._enabledExtensions.walletConnect) {
      this.logger.warn('Wallet Connect has been disabled for this build');
      return;
    }

    let stateParams = {
      uri
    };
    let nextView = {
      name: 'WalletConnectPage',
      params: stateParams
    };

    this.analyticsProvider.logEvent('wallet_connect_camera_scan_attempt', {});
    this.incomingDataRedir(nextView);
  }

  private handleBitcoinCashUriLegacyAddress(data: string): void {
    this.logger.debug('Incoming-data: Bitcoin Cash URI with legacy address');
    const coin = Coin.BCH;
    let parsed = this.bwcProvider
      .getBitcore()
      .URI(data.replace(/^(bitcoincash:|bchtest:)/, 'bitcoin:'));

    let oldAddr = parsed.address ? parsed.address.toString() : '';
    if (!oldAddr)
      this.logger.error('Could not parse Bitcoin Cash legacy address');

    let a = this.bwcProvider.getBitcore().Address(oldAddr).toObject();
    let address = this.bwcProvider
      .getBitcoreCash()
      .Address.fromObject(a)
      .toString();
    let message = parsed.message;
    let amount = parsed.amount ? parsed.amount : '';

    // Translate address
    this.logger.warn('Legacy Bitcoin Address translated to: ' + address);
    if (parsed.r) {
      const payProUrl = this.getPayProUrl(parsed.r);
      this.goToPayPro(payProUrl, coin);
    } else this.goSend(address, amount, message, coin);
  }

  // Deprecated
  private handlePlainUrl(data: string): void {
    this.logger.debug('Incoming-data: Plain URL', data);
    // No process Plain URL anymore
    // data = this.sanitizeUri(data);
    // this.showMenu({
    //  data,
    //  type: 'url'
    // });
  }

  private handlePlainBitcoinAddress(
    data: string,
    redirParams?: RedirParams
  ): void {
    this.logger.debug('Incoming-data: Bitcoin plain address');
    const coin = Coin.BTC;
    if (redirParams && redirParams.activePage === 'ScanPage') {
      this.showMenu({
        data,
        type: 'bitcoinAddress',
        coin
      });
    } else if (redirParams && redirParams.amount) {
      this.goSend(data, redirParams.amount, '', coin);
    } else {
      this.goToAmountPage(data, coin);
    }
  }

  private handlePlainBitcoinCashAddress(
    data: string,
    redirParams?: RedirParams
  ): void {
    this.logger.debug('Incoming-data: Bitcoin Cash plain address');
    const coin = Coin.BCH;
    if (redirParams && redirParams.activePage === 'ScanPage') {
      this.showMenu({
        data,
        type: 'bitcoinAddress',
        coin
      });
    } else if (redirParams && redirParams.amount) {
      this.goSend(data, redirParams.amount, '', coin);
    } else {
      this.goToAmountPage(data, coin);
    }
  }

  private handleEthereumAddress(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Ethereum address');
    const coin = Coin.ETH;
    if (redirParams && redirParams.activePage === 'ScanPage') {
      this.showMenu({
        data,
        type: 'ethereumAddress',
        coin
      });
    } else if (redirParams && redirParams.amount) {
      this.goSend(data, redirParams.amount, '', coin);
    } else {
      this.goToAmountPage(data, coin);
    }
  }

  private handleRippleAddress(data: string, redirParams?: RedirParams): void {
    this.logger.debug('Incoming-data: Ripple address');
    const coin = Coin.XRP;
    if (redirParams && redirParams.activePage === 'ScanPage') {
      this.showMenu({
        data,
        type: 'rippleAddress',
        coin
      });
    } else if (redirParams && redirParams.amount) {
      this.goSend(data, redirParams.amount, '', coin);
    } else {
      this.goToAmountPage(data, coin);
    }
  }

  private handlePlainDogecoinAddress(
    data: string,
    redirParams?: RedirParams
  ): void {
    this.logger.debug('Incoming-data: Dogecoin plain address');
    const coin = Coin.DOGE;
    if (redirParams && redirParams.activePage === 'ScanPage') {
      this.showMenu({
        data,
        type: 'dogecoinAddress',
        coin
      });
    } else if (redirParams && redirParams.amount) {
      this.goSend(data, redirParams.amount, '', coin);
    } else {
      this.goToAmountPage(data, coin);
    }
  }

  private goToImportByPrivateKey(data: string): void {
    this.logger.debug('Incoming-data (redirect): QR code export feature');

    let stateParams = { code: data };
    let nextView = {
      name: 'ImportWalletPage',
      params: stateParams
    };
    this.incomingDataRedir(nextView);
  }

  private goToJoinWallet(data: string): void {
    this.logger.debug('Incoming-data (redirect): Code to join to a wallet');
    let nextView, stateParams;

    const opts = {
      showHidden: true,
      canAddNewAccount: true
    };
    const wallets = this.profileProvider.getWallets(opts);
    const nrKeys = _.values(_.groupBy(wallets, 'keyId')).length;

    if (nrKeys === 0) {
      stateParams = { url: data };
      nextView = {
        name: 'JoinWalletPage',
        params: stateParams
      };
    } else if (nrKeys != 1) {
      stateParams = { url: data, isJoin: true };
      nextView = {
        name: 'AddWalletPage',
        params: stateParams
      };
    } else if (nrKeys === 1) {
      stateParams = { keyId: wallets[0].credentials.keyId, url: data };
      nextView = {
        name: 'JoinWalletPage',
        params: stateParams
      };
    }

    if (this.isValidJoinCode(data) || this.isValidJoinLegacyCode(data)) {
      this.incomingDataRedir(nextView);
    } else {
      this.logger.error('Incoming-data: Invalid code to join to a wallet');
    }
  }

  // private goTorothCard(data: string): void {
  //   this.logger.debug('Incoming-data (redirect): roth Card URL');
  //
  //   // Disable roth Card
  //   if (!this.appProvider.info._enabledExtensions.debitcard) {
  //     this.logger.warn('roth Card has been disabled for this build');
  //     return;
  //   }
  //
  //   let secret = this.getParameterByName('secret', data);
  //   let email = this.getParameterByName('email', data);
  //   let otp = this.getParameterByName('otp', data);
  //   let reason = this.getParameterByName('r', data);
  //   switch (reason) {
  //     default:
  //     case '0':
  //       /* For roth card binding */
  //       let stateParams = { secret, email, otp };
  //       let nextView = {
  //         name: 'rothCardIntroPage',
  //         params: stateParams
  //       };
  //       this.incomingDataRedir(nextView);
  //       break;
  //   }
  // }

  private goTorothRedir(data: string): void {
    this.logger.debug('Incoming-data (redirect): roth Redir');
    const redir = data.replace('roth://landing/', '');
    switch (redir) {
      default:
      case 'card':
        // Disable roth Card
        if (!this.appProvider.info._enabledExtensions.debitcard) {
          this.logger.warn('roth Card has been disabled for this build');
          return;
        }
        const nextView = {
          name: 'PhaseOneCardIntro'
        };
        this.incomingDataRedir(nextView);
        break;
    }
  }

  private goToCoinbase(data: string): void {
    this.logger.debug('Incoming-data (redirect): Coinbase URL');

    let code = this.getParameterByName('code', data);
    let stateParams = { code };
    let nextView = {
      name: 'CoinbasePage',
      params: stateParams
    };
    this.incomingDataRedir(nextView);
  }

  private goToSimplex(data: string): void {
    this.logger.debug('Incoming-data (redirect): Simplex URL: ' + data);

    const res = data.replace(new RegExp('&amp;', 'g'), '&');
    const success = this.getParameterByName('success', res);
    const paymentId = this.getParameterByName('paymentId', res);
    const quoteId = this.getParameterByName('quoteId', res);
    const userId = this.getParameterByName('userId', res);

    const stateParams = { success, paymentId, quoteId, userId };
    const nextView = {
      name: 'SimplexPage',
      params: stateParams
    };
    this.incomingDataRedir(nextView);
  }

  private goToWyre(data: string): void {
    this.logger.debug('Incoming-data (redirect): Wyre URL: ' + data);
    if (data.indexOf(this.appProvider.info.name + '://wyreError') >= 0) {
      const infoSheet = this.actionSheetProvider.createInfoSheet('wyre-error');
      infoSheet.present();
      infoSheet.onDidDismiss(option => {
        if (option) {
          this.openExternalLink(
            'https://wyre-support.zendesk.com/hc/en-us/requests/new'
          );
        }
      });
      return;
    }

    if (data === this.appProvider.info.name + '://wyre') return;
    const res = data.replace(new RegExp('&amp;', 'g'), '&');
    const transferId = this.getParameterByName('transferId', res);
    const walletId = this.getParameterByName('walletId', res);
    const owner = this.getParameterByName('owner', res);
    const orderId = this.getParameterByName('id', res);
    const accountId = this.getParameterByName('accountId', res);
    const dest = this.getParameterByName('dest', res);
    const destAmount = this.getParameterByName('destAmount', res);
    const destCurrency = this.getParameterByName('destCurrency', res);
    const purchaseAmount = this.getParameterByName('purchaseAmount', res);
    const sourceAmount = this.getParameterByName('sourceAmount', res);
    const sourceCurrency = this.getParameterByName('sourceCurrency', res);
    const status = this.getParameterByName('status', res);
    const createdAt = this.getParameterByName('createdAt', res);
    const paymentMethodName = this.getParameterByName('paymentMethodName', res);
    const blockchainNetworkTx = this.getParameterByName(
      'blockchainNetworkTx',
      res
    );
    if (!orderId) {
      this.logger.debug('No orderId present. Do not redir');
      return;
    }

    const stateParams = {
      transferId,
      walletId,
      owner,
      orderId,
      accountId,
      dest,
      destAmount,
      destCurrency,
      purchaseAmount,
      sourceAmount,
      sourceCurrency,
      status,
      createdAt,
      paymentMethodName,
      blockchainNetworkTx
    };
    const nextView = {
      name: 'WyrePage',
      params: stateParams
    };
    this.incomingDataRedir(nextView);
  }

  private openExternalLink(url: string) {
    this.externalLinkProvider.open(url);
  }

  private goToInvoice(data: string): void {
    this.logger.debug('Incoming-data (redirect): Invoice URL');

    const invoiceUrl = this.getParameterByName('url', data);
    this.redir(invoiceUrl);
  }

  private openIAB(message): void {
    this.iabCardProvider.hasFirstView().then(() => {
      this.iabCardProvider.show();
      this.iabCardProvider.sendMessage({
        message
      });
    });
  }

  public redir(data: string, redirParams?: RedirParams): boolean {
    if (redirParams && redirParams.activePage)
      this.activePage = redirParams.activePage;

    //  Handling of a roth invoice url
    if (this.isValidrothInvoice(data)) {
      this.handlerothInvoice(data);
      return true;
    } else if (data.includes('unlock')) {
      this.handleUnlock(data);
      return true;

      // Payment Protocol
    } else if (this.isValidPayPro(data)) {
      this.handlePayProNonBackwardsCompatible(data);
      return true;

      // Bitcoin  URI
    } else if (this.isValidBitcoinUri(data)) {
      this.handleBitcoinUri(data, redirParams);
      return true;

      // Bitcoin Cash URI
    } else if (this.isValidBitcoinCashUri(data)) {
      this.handleBitcoinCashUri(data, redirParams);
      return true;

      // Ethereum URI
    } else if (this.isValidEthereumUri(data)) {
      this.handleEthereumUri(data, redirParams);
      return true;

      // Ripple URI
    } else if (this.isValidRippleUri(data)) {
      this.handleRippleUri(data, redirParams);
      return true;

      // Dogecoin URI
    } else if (this.isValidDogecoinUri(data)) {
      this.handleDogecoinUri(data, redirParams);
      return true;

      // Wallet Connect URI
    } else if (this.isValidWalletConnectUri(data)) {
      this.handleWalletConnectUri(data);
      return true;

      // Bitcoin Cash URI using Bitcoin Core legacy address
    } else if (this.isValidBitcoinCashUriWithLegacyAddress(data)) {
      this.handleBitcoinCashUriLegacyAddress(data);
      return true;

      // Plain URL
    } else if (this.isValidPlainUrl(data)) {
      this.handlePlainUrl(data);
      return true;

      // Plain Address (Bitcoin)
    } else if (this.isValidBitcoinAddress(data)) {
      this.handlePlainBitcoinAddress(data, redirParams);
      return true;

      // Plain Address (Bitcoin Cash)
    } else if (this.isValidBitcoinCashAddress(data)) {
      this.handlePlainBitcoinCashAddress(data, redirParams);
      return true;

      // Address (Ethereum)
    } else if (this.isValidEthereumAddress(data)) {
      this.handleEthereumAddress(data, redirParams);
      return true;

      // Address (Ripple)
    } else if (this.isValidRippleAddress(data)) {
      this.handleRippleAddress(data, redirParams);
      return true;

      // Plain Address (Doge)
    } else if (this.isValidDogecoinAddress(data)) {
      this.handlePlainDogecoinAddress(data, redirParams);
      return true;

      // Coinbase
    } else if (this.isValidCoinbaseUri(data)) {
      this.goToCoinbase(data);
      return true;

      // Simplex
    } else if (this.isValidSimplexUri(data)) {
      this.goToSimplex(data);
      return true;

      // Wyre
    } else if (this.isValidWyreUri(data)) {
      this.goToWyre(data);
      return true;

      // Invoice Intent
    } else if (this.isValidInvoiceUri(data)) {
      this.goToInvoice(data);
      return true;

      // roth Redir Link
    } else if (this.isValidrothRedirLink(data)) {
      this.goTorothRedir(data);
      return true;

      // rothCard Authentication
    } else if (this.isValidrothCardUri(data)) {
      // this.goTorothCard(data);
      return true;

      // roth URI
    } else if (this.isValidrothUri(data)) {
      this.handlerothUri(data);
      return true;

      // Join
    } else if (this.isValidJoinCode(data) || this.isValidJoinLegacyCode(data)) {
      this.goToJoinWallet(data);
      return true;

      // Check Private Key
    } else if (this.isValidPrivateKey(data)) {
      this.handlePrivateKey(data, redirParams);
      return true;

      // Import Private Key
    } else if (this.isValidImportPrivateKey(data)) {
      this.goToImportByPrivateKey(data);
      return true;
    } else if (data.includes('wallet-card')) {
      const event = data.split('wallet-card/')[1];
      const [switchExp, payload] = (event || '').split('?');

      /*
       *
       * handler for wallet-card events
       *
       * leaving this as a switch in case events become complex and require wallet side and iab actions
       *
       * */
      switch (switchExp) {
        case 'pairing':
          const secret = payload.split('=')[1].split('&')[0];
          const params = {
            secret,
            withNotification: true
          };
          if (payload.includes('&code=')) {
            params['code'] = payload.split('&code=')[1];
          }

          if (payload.includes('dashboardRedirect')) {
            params['dashboardRedirect'] = true;
          }

          this.iabCardProvider.pairing({ data: { params } });

          // this param is set if pairing for the first time after an order
          if (payload.includes('fb=orderComplete')) {
            this.persistenceProvider.getNetwork().then(network => {
              if (network === 'livenet') {
                this.analyticsProvider.logEvent('Card_application_Success', {});
              }
            });
          }
          break;

        case 'order-now':
          this.persistenceProvider.setCardExperimentFlag('enabled');

          this.events.publish('experimentUpdateStart');
          setTimeout(() => {
            this.events.publish('experimentUpdateComplete');
          }, 300);

          break;

        case 'email-verified':
          this.openIAB('emailVerified');
          break;

        case 'get-started':
          this.openIAB('orderCard');
          break;

        case 'retry':
          this.openIAB('retry');
          break;

        case 'debit-card-order':
          this.openIAB('debitCardOrder');
          this.persistenceProvider.setCardExperimentFlag('enabled');
          this.events.publish('experimentUpdateStart');
          setTimeout(() => {
            this.events.publish('experimentUpdateComplete');
          }, 300);
      }

      return true;
      // Anything else
    } else if (this.isValidrothDynamicLink(data)) {
      const deepLink = this.getParameterByName('deep_link_id', data);
      this.handleDynamicLink(deepLink);
      return true;
    } else {
      if (redirParams && redirParams.activePage === 'ScanPage') {
        this.logger.debug('Incoming-data: Plain text');
        this.showMenu({
          data,
          type: 'text'
        });
        return true;
      } else {
        this.logger.warn('Incoming-data: Unknown information');
        return false;
      }
    }
  }

  public parseData(data: string): any {
    if (!data) return;
    if (this.isValidrothInvoice(data)) {
      return {
        data,
        type: 'InvoiceUri',
        title: 'Invoice URL'
      };
    } else if (this.isValidPayPro(data)) {
      return {
        data,
        type: 'PayPro',
        title: 'Payment URL'
      };

      // Bitcoin URI
    } else if (this.isValidBitcoinUri(data)) {
      return {
        data,
        type: 'BitcoinUri',
        title: 'Bitcoin URI'
      };

      // Bitcoin Cash URI
    } else if (this.isValidBitcoinCashUri(data)) {
      return {
        data,
        type: 'BitcoinCashUri',
        title: 'Bitcoin Cash URI'
      };

      // Ethereum URI
    } else if (this.isValidEthereumUri(data)) {
      return {
        data,
        type: 'EthereumUri',
        title: 'Ethereum URI'
      };

      // Ripple URI
    } else if (this.isValidRippleUri(data)) {
      return {
        data,
        type: 'RippleUri',
        title: 'Ripple URI'
      };
      // Dogecoin URI
    } else if (this.isValidDogecoinUri(data)) {
      return {
        data,
        type: 'DogecoinUri',
        title: 'Dogecoin URI'
      };
      // Wallet Connect URI
    } else if (this.isValidWalletConnectUri(data)) {
      return {
        data,
        type: 'WalletConnectUri',
        title: 'WalletConnect URI'
      };

      // Bitcoin Cash URI using Bitcoin Core legacy address
    } else if (this.isValidBitcoinCashUriWithLegacyAddress(data)) {
      return {
        data,
        type: 'BitcoinCashUri',
        title: 'Bitcoin Cash URI'
      };

      // Plain URL
    } else if (this.isValidPlainUrl(data)) {
      return {
        data,
        type: 'PlainUrl',
        title: 'Plain URL'
      };

      // Plain Address (Bitcoin)
    } else if (this.isValidBitcoinAddress(data)) {
      return {
        data,
        type: 'BitcoinAddress',
        title: this.translate.instant('Bitcoin Address')
      };

      // Plain Address (Bitcoin Cash)
    } else if (this.isValidBitcoinCashAddress(data)) {
      return {
        data,
        type: 'BitcoinCashAddress',
        title: this.translate.instant('Bitcoin Cash Address')
      };

      // Plain Address (Ethereum)
    } else if (this.isValidEthereumAddress(data)) {
      return {
        data,
        type: 'EthereumAddress',
        title: this.translate.instant('Ethereum Address')
      };

      // Plain Address (Ripple)
    } else if (this.isValidRippleAddress(data)) {
      return {
        data,
        type: 'RippleAddress',
        title: this.translate.instant('XRP Address')
      };

      // Plain Address (Dogecoin)
    } else if (this.isValidDogecoinAddress(data)) {
      return {
        data,
        type: 'DogecoinAddress',
        title: this.translate.instant('Doge Address')
      };

      // Coinbase
    } else if (this.isValidCoinbaseUri(data)) {
      return {
        data,
        type: 'Coinbase',
        title: 'Coinbase URI'
      };

      // rothCard Authentication
    } else if (this.isValidrothCardUri(data)) {
      return {
        data,
        type: 'rothCard',
        title: 'roth Card URI'
      };

      // roth  URI
    } else if (this.isValidrothUri(data)) {
      return {
        data,
        type: 'rothUri',
        title: 'roth URI'
      };

      // Join
    } else if (this.isValidJoinCode(data) || this.isValidJoinLegacyCode(data)) {
      return {
        data,
        type: 'JoinWallet',
        title: this.translate.instant('Invitation Code')
      };

      // Check Private Key
    } else if (this.isValidPrivateKey(data)) {
      return {
        data,
        type: 'PrivateKey',
        title: this.translate.instant('Private Key')
      };

      // Import Private Key
    } else if (this.isValidImportPrivateKey(data)) {
      return {
        data,
        type: 'ImportPrivateKey',
        title: this.translate.instant('Import Words')
      };

      // Anything else
    } else {
      return;
    }
  }

  public extractAddress(data: string): string {
    const address = data.replace(/^[a-z]+:/i, '').replace(/\?.*/, '');
    const params = /([\?\&]+[a-z]+=(\d+([\,\.]\d+)?))+/i;
    return address.replace(params, '');
  }

  private sanitizeUri(data): string {
    // Fixes when a region uses comma to separate decimals
    let regex = /[\?\&]amount=(\d+([\,\.]\d+)?)/i;
    let match = regex.exec(data);
    if (!match || match.length === 0) {
      return data;
    }
    let value = match[0].replace(',', '.');
    let newUri = data.replace(regex, value);

    // mobile devices, uris like roth://xxx
    newUri.replace('://', ':');

    return newUri;
  }

  public getPayProUrl(data: string): string {
    return decodeURIComponent(
      data.replace(/(bitcoin|bitcoincash|ethereum|ripple|dogecoin)?:\?r=/, '')
    );
  }

  public getParameterByName(name: string, url: string): string {
    if (!url) return undefined;
    name = name.replace(/[\[\]]/g, '\\$&');
    let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }

  private checkPrivateKey(privateKey: string): boolean {
    // Check if it is a Transaction id to prevent errors
    let isPK: boolean = this.checkRegex(privateKey);
    if (!isPK) return false;
    try {
      this.bwcProvider.getBitcore().PrivateKey(privateKey, 'livenet');
    } catch (err) {
      return false;
    }
    return true;
  }

  private checkRegex(data: string): boolean {
    let PKregex = new RegExp(/^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/);
    return !!PKregex.exec(data);
  }

  private goSend(
    addr: string,
    amount: string,
    message: string,
    coin: Coin,
    requiredFeeRate?: string,
    destinationTag?: string
  ): void {
    if (amount) {
      let stateParams = {
        amount,
        toAddress: addr,
        description: message,
        coin,
        requiredFeeRate,
        destinationTag
      };
      let nextView = {
        name: 'ConfirmPage',
        params: stateParams
      };
      this.incomingDataRedir(nextView);
    } else {
      let stateParams = {
        toAddress: addr,
        description: message,
        coin
      };
      let nextView = {
        name: 'AmountPage',
        params: stateParams
      };
      this.incomingDataRedir(nextView);
    }
  }

  private goToAmountPage(toAddress: string, coin: Coin): void {
    let stateParams = {
      toAddress,
      coin
    };
    let nextView = {
      name: 'AmountPage',
      params: stateParams
    };

    this.incomingDataRedir(nextView);
  }

  public goToPayPro(
    url: string,
    coin: Coin,
    payProOptions?,
    disableLoader?: boolean,
    activePage?: string
  ): void {
    if (activePage) this.activePage = activePage;
    this.payproProvider
      .getPayProDetails({ paymentUrl: url, coin, disableLoader })
      .then(details => {
        this.onGoingProcessProvider.clear();
        this.handlePayPro(details, payProOptions, url, coin);
      })
      .catch(err => {
        this.onGoingProcessProvider.clear();
        this.events.publish('incomingDataError', err);
        this.logger.error(err);
      });
  }

  private async handlePayPro(
    payProDetails,
    payProOptions,
    url,
    coin: Coin
  ): Promise<void> {
    if (!payProDetails) {
      this.logger.error('No wallets available');
      const error = this.translate.instant('No wallets available');
      this.events.publish('incomingDataError', error);
      return;
    }

    let invoiceID;
    let requiredFeeRate;

    if (payProDetails.requiredFeeRate) {
      requiredFeeRate = !this.currencyProvider.isUtxoCoin(coin)
        ? payProDetails.requiredFeeRate
        : Math.ceil(payProDetails.requiredFeeRate * 1000);
    }

    try {
      const { memo, network } = payProDetails;
      if (!payProOptions) {
        payProOptions = await this.payproProvider.getPayProOptions(url);
      }
      const paymentOptions = payProOptions.paymentOptions;
      const { estimatedAmount, minerFee } = paymentOptions.find(
        option => option.currency.toLowerCase() === coin
      );
      const instructions = payProDetails.instructions[0];
      const { outputs, toAddress, data } = instructions;
      if (coin === 'xrp' && outputs) {
        invoiceID = outputs[0].invoiceID;
      }
      const stateParams = {
        amount: estimatedAmount,
        toAddress,
        description: memo,
        data,
        invoiceID,
        paypro: payProDetails,
        coin,
        network,
        payProUrl: url,
        requiredFeeRate,
        minerFee // needed for payments with Coinbase accounts
      };
      const nextView = {
        name: 'ConfirmPage',
        params: stateParams
      };
      this.incomingDataRedir(nextView);
    } catch (err) {
      this.events.publish('incomingDataError', err);
      this.logger.error(err);
    }
  }

  private incomingDataRedir(nextView) {
    if (this.activePage === 'SendPage') {
      this.events.publish('SendPageRedir', nextView);
    } else {
      this.events.publish('IncomingDataRedir', nextView);
    }
  }

  private async handleUnlock(data) {
    try {
      const url = data.split('?')[1];
      const invoiceId = url.split('i/')[1];

      const result = await this.rothIdProvider.unlockInvoice(invoiceId);

      switch (result) {
        case 'unlockSuccess':
          await this.handlerothInvoice(`unlock:?${url}`);
          break;

        // call IAB and attempt pairing
        case 'pairingRequired':
          const authRequiredInfoSheet = this.actionSheetProvider.createInfoSheet(
            'auth-required'
          );
          await authRequiredInfoSheet.present();
          authRequiredInfoSheet.onDidDismiss(() => {
            this.iabCardProvider.show();
            setTimeout(() => {
              this.iabCardProvider.sendMessage(
                {
                  message: 'pairingOnly',
                  payload: { paymentUrl: data }
                },
                () => {}
              );
            }, 100);
          });
          break;

        // needs verification - send to roth id verify
        case 'userShopperNotFound':
        case 'tierNotMet':
          const verificationRequiredInfoSheet = this.actionSheetProvider.createInfoSheet(
            'auth-required'
          );
          await verificationRequiredInfoSheet.present();
          verificationRequiredInfoSheet.onDidDismiss(async () => {
            const host = url.includes('test')
              ? 'test.roth.com'
              : 'roth.com';
            await this.externalLinkProvider.open(
              `https://${host}/id/verify?context=unlockv&id=${invoiceId}`
            );
          });
      }
    } catch (err) {
      this.logger.error(err);
      await this.actionSheetProvider
        .createInfoSheet('default-error', {
          msg: this.translate.instant(
            'Uh oh something went wrong! Please try again later.'
          ),
          title: this.translate.instant('Error')
        })
        .present();
    }
  }
}

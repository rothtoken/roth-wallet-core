import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EmailNotificationsProvider } from '../email-notifications/email-notifications';
import { Logger } from '../logger/logger';
import { Network, PersistenceProvider } from '../persistence/persistence';

@Injectable()
export class InvoiceProvider {
  credentials: {
    NETWORK: Network;
    roth_API_URL: string;
  } = {
    NETWORK: Network.livenet,
    roth_API_URL: 'https://roth.com'
  };

  constructor(
    public emailNotificationsProvider: EmailNotificationsProvider,
    public http: HttpClient,
    public logger: Logger,
    public persistenceProvider: PersistenceProvider
  ) {
    this.logger.debug('InvoiceProvider initialized');
  }

  public setNetwork(network: string) {
    this.credentials.NETWORK = Network[network];
    this.credentials.roth_API_URL =
      network === Network.livenet
        ? 'https://roth.com'
        : 'https://test.roth.com';
    this.logger.log(`invoice provider initialized with ${network}`);
  }

  public getNetwork() {
    return this.credentials.NETWORK;
  }

  getApiPath() {
    return `${this.credentials.roth_API_URL}/gift-cards`;
  }

  public async getrothInvoice(id: string) {
    const res: any = await this.http
      .get(`${this.credentials.roth_API_URL}/invoices/${id}`)
      .toPromise()
      .catch(err => {
        this.logger.error('roth Get Invoice: ERROR ' + err.error.message);
        throw err.error.message;
      });
    this.logger.info('roth Get Invoice: SUCCESS');
    return res.data;
  }

  public emailIsValid(email: string): boolean {
    const validEmail = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
      email
    );
    return validEmail;
  }

  public storeEmail(email: string): void {
    this.setUserInfo({ email });
  }

  private setUserInfo(data: any): void {
    this.persistenceProvider.setGiftCardUserInfo(JSON.stringify(data));
  }
}

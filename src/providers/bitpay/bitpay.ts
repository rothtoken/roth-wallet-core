import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Logger } from '../../providers/logger/logger';

// providers
import { AppIdentityProvider } from '../app-identity/app-identity';

import * as bitauthService from 'bitauth';

@Injectable()
export class rothProvider {
  private NETWORK: string;
  private roth_API_URL: string;
  constructor(
    private http: HttpClient,
    private appIdentityProvider: AppIdentityProvider,
    private logger: Logger
  ) {
    this.logger.debug('rothProvider initialized');
  }

  public setNetwork(network: string) {
    this.NETWORK = network;
    this.roth_API_URL =
      this.NETWORK == 'livenet'
        ? 'https://roth.com'
        : 'https://test.roth.com';
    this.logger.log(`roth provider initialized with ${this.NETWORK}`);
  }

  public getEnvironment() {
    return {
      network: this.NETWORK
    };
  }

  public get(endpoint, successCallback, errorCallback) {
    let url = this.roth_API_URL + endpoint;
    let headers = {
      'Content-Type': 'application/json'
    };
    this.http.get(url, { headers }).subscribe(
      data => {
        successCallback(data);
      },
      data => {
        errorCallback(data);
      }
    );
  }

  public post(endpoint, json, successCallback, errorCallback) {
    this.appIdentityProvider.getIdentity(
      this.getEnvironment().network,
      (err, appIdentity) => {
        if (err) {
          return errorCallback(err);
        }

        let dataToSign = this.roth_API_URL + endpoint + JSON.stringify(json);
        let signedData = bitauthService.sign(dataToSign, appIdentity.priv);
        let url = this.roth_API_URL + endpoint;

        let headers = new HttpHeaders().set('content-type', 'application/json');
        headers = headers.append('x-identity', appIdentity.pub);
        headers = headers.append('x-signature', signedData);

        this.http.post(url, json, { headers }).subscribe(
          data => {
            successCallback(data);
          },
          data => {
            errorCallback(data);
          }
        );
      }
    );
  }

  public postAuth(json, successCallback, errorCallback) {
    this.appIdentityProvider.getIdentity(
      this.getEnvironment().network,
      (err, appIdentity) => {
        if (err) {
          return errorCallback(err);
        }

        json['params'].signature = bitauthService.sign(
          JSON.stringify(json.params),
          appIdentity.priv
        );
        json['params'].pubkey = appIdentity.pub;
        json['params'] = JSON.stringify(json.params);
        let url = this.roth_API_URL + '/api/v2/';
        let headers = {
          'Content-Type': 'application/json'
        };
        this.logger.debug('post auth:' + JSON.stringify(json));
        this.http.post(url, json, { headers }).subscribe(
          (data: any) => {
            data.appIdentity = appIdentity;
            successCallback(data);
          },
          data => {
            errorCallback(data);
          }
        );
      }
    );
  }
}

import { ContentMessage } from '../ContentMessage';
import { SignalService } from '../../../../../protobuf';
import { MessageParams } from '../../Message';
import { Constants } from '../../../..';
export interface DeviceLinkMessageParams extends MessageParams {
  primaryDevicePubKey: string;
  secondaryDevicePubKey: string;
  requestSignature: Uint8Array;
}

export class DeviceLinkRequestMessage extends ContentMessage {
  protected readonly primaryDevicePubKey: string;
  protected readonly secondaryDevicePubKey: string;
  protected readonly requestSignature: Uint8Array;

  constructor(params: DeviceLinkMessageParams) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.primaryDevicePubKey = params.primaryDevicePubKey;
    this.secondaryDevicePubKey = params.secondaryDevicePubKey;
    this.requestSignature = params.requestSignature;
  }

  public ttl(): number {
    return Constants.TTL_DEFAULT.PAIRING_REQUEST;
  }

  protected getDataMessage(): SignalService.DataMessage | undefined {
    return undefined;
  }

  protected getPairingAuthorisationMessage(): SignalService.PairingAuthorisationMessage {
    return new SignalService.PairingAuthorisationMessage({
      primaryDevicePubKey: this.primaryDevicePubKey,
      secondaryDevicePubKey: this.secondaryDevicePubKey,
      requestSignature: new Uint8Array(this.requestSignature),
      grantSignature: null,
    });
  }

  protected contentProto(): SignalService.Content {
    return new SignalService.Content({
      pairingAuthorisation: this.getPairingAuthorisationMessage(),
      dataMessage: this.getDataMessage(),
    });
  }
}

/* eslint-disable class-methods-use-this */
/* global window, ConversationController */

const is = require('@sindresorhus/is');
const dns = require('dns');
const process = require('process');
const { rpc } = require('./loki_rpc');

const resolve4 = url =>
  new Promise((resolve, reject) => {
    dns.resolve4(url, (err, ip) => {
      if (err) {
        reject(err);
      } else {
        resolve(ip);
      }
    });
  });

const resolveCname = url =>
  new Promise((resolve, reject) => {
    dns.resolveCname(url, (err, address) => {
      if (err) {
        reject(err);
      } else {
        resolve(address[0]);
      }
    });
  });

class LokiSnodeAPI {
  constructor({ serverUrl, localUrl }) {
    if (!is.string(serverUrl)) {
      throw new Error('WebAPI.initialize: Invalid server url');
    }
    this.serverUrl = serverUrl;
    this.localUrl = localUrl;
    this.randomSnodePool = [];
    this.swarmsPendingReplenish = {};
    // When we package lokinet with messenger we can ensure this ip is correct
    if (process.platform === 'win32') {
      dns.setServers(['127.0.0.1']);
    }
  }

  async getMyLokiIp() {
    try {
      const address = await resolveCname(this.localUrl);
      return resolve4(address);
    } catch (e) {
      throw new window.textsecure.LokiIpError(
        'Failed to resolve localhost.loki',
        e
      );
    }
  }

  getMyLokiAddress() {
    /* resolve our local loki address */
    return resolveCname(this.localUrl);
  }

  async getRandomSnodeAddress() {
    /* resolve random snode */
    if (this.randomSnodePool.length === 0) {
      await this.initialiseRandomPool();
    }
    return this.randomSnodePool[
      Math.floor(Math.random() * this.randomSnodePool.length)
    ];
  }

  async initialiseRandomPool() {
    const result = await rpc(
      `http://${window.seedNodeUrl}`,
      window.seedNodePort,
      'get_service_nodes',
      {}, // Params
      {}, // Options
      '/json_rpc' // Seed request endpoint
    );
    const snodes = result.result.service_node_states;
    this.randomSnodePool = snodes.map(snode => ({
      address: snode.public_ip,
      port: snode.storage_port,
    }));
  }

  async unreachableNode(pubKey, nodeUrl) {
    const conversation = ConversationController.get(pubKey);
    const swarmNodes = [...conversation.get('swarmNodes')];
    if (swarmNodes.includes(nodeUrl)) {
      const filteredNodes = swarmNodes.filter(node => node !== nodeUrl);
      await conversation.updateSwarmNodes(filteredNodes);
    }
  }

  async updateLastHash(nodeUrl, lastHash, expiresAt) {
    await window.Signal.Data.updateLastHash({ nodeUrl, lastHash, expiresAt });
  }

  getSwarmNodesForPubKey(pubKey) {
    try {
      const conversation = ConversationController.get(pubKey);
      const swarmNodes = [...conversation.get('swarmNodes')];
      return swarmNodes;
    } catch (e) {
      throw new window.textsecure.ReplayableError({
        message: 'Could not get conversation',
      });
    }
  }

  async updateSwarmNodes(pubKey, newNodes) {
    try {
      const conversation = ConversationController.get(pubKey);
      await conversation.updateSwarmNodes(newNodes);
    } catch (e) {
      throw new window.textsecure.ReplayableError({
        message: 'Could not get conversation',
      });
    }
  }

  async refreshSwarmNodesForPubKey(pubKey) {
    const newNodes = await this.getFreshSwarmNodes(pubKey);
    this.updateSwarmNodes(pubKey, newNodes);
  }

  async getFreshSwarmNodes(pubKey) {
    if (!(pubKey in this.swarmsPendingReplenish)) {
      this.swarmsPendingReplenish[pubKey] = new Promise(async resolve => {
        let newSwarmNodes;
        try {
          newSwarmNodes = await this.getSwarmNodes(pubKey);
        } catch (e) {
          // TODO: Handle these errors sensibly
          newSwarmNodes = [];
        }
        resolve(newSwarmNodes);
      });
    }
    const newSwarmNodes = await this.swarmsPendingReplenish[pubKey];
    delete this.swarmsPendingReplenish[pubKey];
    return newSwarmNodes;
  }

  async getSwarmNodes(pubKey) {
    // TODO: Hit multiple random nodes and merge lists?
    const { address, port } = await this.getRandomSnodeAddress();

    const result = await rpc(
      `https://${address}`,
      port,
      'get_snodes_for_pubkey',
      {
        pubKey,
      }
    );
    return result.snodes;
  }
}

module.exports = LokiSnodeAPI;

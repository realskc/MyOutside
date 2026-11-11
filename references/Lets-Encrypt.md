# Let's Encrypt

> 最近一次核对：2026-11-11。

免费、自动签发 TLS 证书的证书机构（ISRG 运营）。和我们相关的是：**没有域名时，也能给 IP 地址签证书**——作者的云服务器暂时没有域名（[platform.md「多端」](../user-spec/platform.md)）。

## IP 地址证书

- 2026-01-15 起正式可用（[6-day and IP Address Certificates are Generally Available](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability.html)）；支持 IPv4 和 IPv6。
- IP 地址证书**只能是短期证书**：有效期 160 小时（6 天多一点），所以续期必须自动化。
- 申请时在 ACME 客户端里选 `shortlived` 证书配置（profile）；客户端要支持 ACME Profiles。Certbot 已经支持（同一篇文章 2026-03-11 的更新：「Six-Day and IP Address Certificates Available in Certbot」）。
- 验证方式只能用 `http-01`（要能从外面访问服务器的 80 端口）或 `tls-alpn-01`（443 端口），不能用 DNS 验证（[We've Issued Our First IP Address Certificate](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate.html)）。

## 普通（域名）证书

- 目前默认 90 天；按官方计划，接下来几年默认有效期会缩短到 45 天（来源：上面「正式可用」那篇）。

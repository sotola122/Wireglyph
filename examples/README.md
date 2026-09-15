# Wireglyph examples

Complex Packet, Register Map, and Memory Map samples used as renderer test data.
Each file must `renderWireglyphSVG` to a single `<svg>` root (`tests/examples.test.ts`).

## Packet (`examples/packet/`)

| File | Pattern |
| --- | --- |
| `ieee80211-mac.packet` | 24 B wrap 8, Frame Control **stack** + Sequence Control **detail** |
| `usb-control-setup.packet` | 8 B SETUP, `bmRequestType` **detail** |
| `ipv4-header.packet` | 20 B, Ver/IHL stack + Flags/FragOffset stack |
| `tcp-header.packet` | 20 B, Data Offset/Flags **grid** |
| `ble-att-notification.packet` | 48 B wrap 16, opcode detail + flags grid |
| `can-fd-data.packet` | 80 B wrap 16, 64 B payload, J1939 ID stack |

## Register map (`examples/register/`)

| File | Pattern |
| --- | --- |
| `stm32-usart-cr1.register` | 32-bit mixed 1-bit enables |
| `cortex-m-xpsr.register` | 32-bit N/Z/C/V + ISR |
| `spi-ctrl-16.register` | 16-bit SPI master |
| `sensor-status-8.register` | 8-bit W1C / RO sticky status |
| `rtc-timestamp-64.register` | 64-bit RTC seconds + subsecond + TZ + flags |

## Memory map (`examples/memorymap/`)

| File | Pattern |
| --- | --- |
| `cortex-m4.memorymap` | ARMv7-M default map, `[0xSTART-0xEND]` |
| `rp2040.memorymap` | Sparse SoC regions |
| `nrf52840.memorymap` | Flash partitions + FICR/UICR |
| `firmware-partitions.memorymap` | Colon `0xSTART-0xEND:` NOR layout |

# Initial resource measurements

Measured on this Mac: Apple M3 Pro, 18 GiB memory, Kokoro v1.0 int8, Bella,
two CPU inference threads, spinning disabled. These were short local runs.
They are not hard memory limits or temperature/battery-life measurements.

| Test | Audio | Generation | Peak process memory |
| --- | --- | --- | --- |
| Initial article, larger chunks | 72.8 s | 11.4 s | 1,906.7 MB |
| Same article, 240-character chunks | 73.1 s | 11.7 s | 897.5 MB |
| Short muted playback / stop test | 21.2 s generated | 4.1 s | 715.7 MB |
| Model-aligned numeric sentence | 5.2 s | 1.4 s | 461.1 MB |

The smaller chunk size became the default. The playback test verified Control-C
stopped both the reader and its audio process. A second clipboard reader was
rejected while another clipboard reader was active. Offline generation succeeded
with socket connections blocked.

The later backend keeps the model in a disposable worker and retires it after
three idle minutes. Its timings come from the model; the earlier clipboard tests
did not exercise the browser extension. Local WAV/JSON artifacts are preserved
under `.data/output/` and remain outside Git. Paths embedded in older JSON files
refer to the location before the move to the Desktop.

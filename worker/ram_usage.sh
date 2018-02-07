#!/bin/bash

bazel build //proto:proto_nanopb
scons
avr-nm -Crtd --size-sort build/builder-fw.elf  |  grep -i ' [dbv] ' | cut -d " " -f1 | python -c "import sys; print('TOTAL=',sum(int(l) for l in sys.stdin))"
avr-nm -Crtd --size-sort build/builder-fw.elf  |  grep -i ' [dbv] '

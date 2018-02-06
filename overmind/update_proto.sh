#!/usr/bin/bash

bazel build //proto:proto_js && rm -rf src/builder_pb.js && cp ../bazel-genfiles/proto/builder_pb.js src/

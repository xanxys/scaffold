licenses(["notice"])

exports_files(["LICENSE.txt"])

package(default_visibility = ["//visibility:public"])

cc_library(
  name = "nanopb",
  visibility = ["//visibility:public"],
  hdrs = [
    "pb.h",
    "pb_common.h",
    "pb_decode.h",
    "pb_encode.h",
  ],
  srcs = [
    "pb_common.c",
    "pb_decode.c",
    "pb_encode.c",
  ],
)

filegroup(
  name = "generator_bin",
  srcs = ["generator/nanopb_generator.py"],
)

py_library(
  name = "generator_lib",
  srcs = ["generator/proto/__init__.py", "generator/proto/nanopb_pb2.py", "generator/proto/plugin_pb2.py"],
)